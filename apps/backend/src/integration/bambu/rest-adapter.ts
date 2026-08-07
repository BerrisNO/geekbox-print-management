import { Normalizer } from '../normalizer.js';
import type { BambuCloudGateway, LinkResult, PrinterDescriptor, TaskRecord } from '../ports.js';
import { loginResponseSchema } from './raw-schemas.js';

const API_BASE = 'https://api.bambulab.com';
/** Pending code challenges (in-memory; single user). Maps challengeId → the email used. */
const challenges = new Map<string, { email: string; tfaKey?: string }>();

/**
 * BambuRestAdapter — primary REST adapter (A-01/02/04). Talks to the UNVERIFIED
 * community-documented endpoints. All responses pass through the tolerant
 * normalizer; this adapter is the only place Bambu REST shapes exist.
 */
export class BambuRestAdapter implements BambuCloudGateway {
  constructor(
    private readonly normalizer: Normalizer,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async login(email: string, password: string): Promise<LinkResult> {
    const res = await this.fetchFn(`${API_BASE}/v1/user-service/user/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ account: email, password }),
    });
    if (!res.ok) {
      throw new Error(`login failed: ${res.status}`);
    }
    const parsed = loginResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('login response drift');
    const data = parsed.data;
    if (data.accessToken) {
      return {
        kind: 'linked',
        bambuUid: data.uid != null ? String(data.uid) : '',
        accessToken: data.accessToken,
        ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
      };
    }
    // No token → a verification code is required (Q-06 provision).
    const challengeId = crypto.randomUUID();
    challenges.set(challengeId, { email, ...(data.tfaKey ? { tfaKey: data.tfaKey } : {}) });
    return { kind: 'code_required', challengeId };
  }

  async verifyCode(challengeId: string, code: string): Promise<LinkResult> {
    const challenge = challenges.get(challengeId);
    if (!challenge) throw new Error('unknown challenge');
    const res = await this.fetchFn(`${API_BASE}/v1/user-service/user/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ account: challenge.email, code }),
    });
    if (!res.ok) throw new Error(`verify failed: ${res.status}`);
    const parsed = loginResponseSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.accessToken) throw new Error('verify response drift');
    challenges.delete(challengeId);
    return {
      kind: 'linked',
      bambuUid: parsed.data.uid != null ? String(parsed.data.uid) : '',
      accessToken: parsed.data.accessToken,
      ...(parsed.data.refreshToken ? { refreshToken: parsed.data.refreshToken } : {}),
    };
  }

  async listDevices(accessToken: string): Promise<PrinterDescriptor[]> {
    const res = await this.fetchFn(`${API_BASE}/v1/iot-service/api/user/bind`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`bind failed: ${res.status}`);
    return this.normalizer.normalizeDevices(await res.json());
  }

  async fetchTasks(accessToken: string, _sinceMs?: number): Promise<TaskRecord[]> {
    const res = await this.fetchFn(`${API_BASE}/v1/user-service/my/tasks`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`tasks failed: ${res.status}`);
    return this.normalizer.normalizeTasks(await res.json());
  }

  async getUserUid(accessToken: string): Promise<string> {
    // The access token is opaque (not a JWT), so the numeric uid — required for the
    // MQTT username u_{uid} — must be read from the authenticated preference
    // endpoint. OrcaSlicer-style headers avoid Cloudflare edge blocking.
    const res = await this.fetchFn(`${API_BASE}/v1/design-user-service/my/preference`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': 'bambu_network_agent/01.09.05.01',
        'x-bbl-client-name': 'OrcaSlicer',
        'x-bbl-client-type': 'slicer',
      },
    });
    if (!res.ok) throw new Error(`preference failed: ${res.status}`);
    const json = (await res.json()) as { uid?: number | string };
    if (json.uid == null || String(json.uid).length === 0) {
      throw new Error('preference response missing uid');
    }
    return String(json.uid);
  }
}
