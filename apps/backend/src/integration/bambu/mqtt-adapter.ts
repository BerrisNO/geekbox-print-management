import mqtt, { type MqttClient } from 'mqtt';
import { Normalizer } from '../normalizer.js';
import type { TelemetryEvent, TelemetrySource } from '../ports.js';

export type MqttAdapterConfig = {
  region: string; // us|eu|cn or a full custom hostname
  bambuUid: string;
  accessToken: string;
  serials: string[];
};

/** Known Bambu MQTT regions (FR-303). */
const KNOWN_REGIONS = new Set(['us', 'eu', 'cn']);
/** Only hostnames under the Bambu MQTT domain are permitted as custom values. */
const ALLOWED_HOST_SUFFIX = '.mqtt.bambulab.com';

/**
 * Resolve and VALIDATE the broker host (MR-001 SSRF / token-exfil fix). The
 * decrypted access token is sent to this host as the MQTT password, so an
 * attacker who can influence the region value could otherwise redirect the
 * connection to a host they control and harvest the token (CWE-918). We therefore
 * allow-list the value: either one of the known short region codes, or a full
 * hostname that must end in the Bambu MQTT domain. Anything else is rejected.
 */
export function resolveBrokerHost(region: string): string {
  const value = region.trim().toLowerCase();
  if (KNOWN_REGIONS.has(value)) {
    return `${value}.mqtt.bambulab.com`;
  }
  // Custom hostname: must be a bare host (no scheme, no path, no credentials, no
  // port) that resolves under the Bambu MQTT domain.
  const hostOk =
    /^[a-z0-9.-]+$/.test(value) &&
    !value.includes('@') &&
    (value === 'mqtt.bambulab.com' || value.endsWith(ALLOWED_HOST_SUFFIX));
  if (!hostOk) {
    throw new Error(
      `Refusing MQTT connection to disallowed region/host "${region}". Allowed: us, eu, cn, or a *.mqtt.bambulab.com hostname.`,
    );
  }
  return value;
}

function brokerUrl(region: string): string {
  return `mqtts://${resolveBrokerHost(region)}:8883`;
}

/**
 * BambuMqttAdapter — primary telemetry source (A-03). Connects to
 * mqtts://{region}.mqtt.bambulab.com:8883 as user u_{uid}, password = access
 * token, subscribes device/{serial}/report. MQTT.js auto-reconnect is DISABLED —
 * the supervisor owns backoff (ADR-004). Emits normalized TelemetryEvents only.
 */
export class BambuMqttAdapter implements TelemetrySource {
  private client: MqttClient | null = null;
  private handlers: Array<(e: TelemetryEvent) => void> = [];

  constructor(
    private readonly config: MqttAdapterConfig,
    private readonly normalizer: Normalizer,
    private readonly connectFn: typeof mqtt.connect = mqtt.connect,
  ) {}

  on(handler: (event: TelemetryEvent) => void): void {
    this.handlers.push(handler);
  }

  private emit(e: TelemetryEvent): void {
    for (const h of this.handlers) {
      try {
        h(e);
      } catch {
        /* isolate */
      }
    }
  }

  async start(): Promise<void> {
    const url = brokerUrl(this.config.region);
    const client = this.connectFn(url, {
      username: `u_${this.config.bambuUid}`,
      password: this.config.accessToken,
      reconnectPeriod: 0, // supervisor owns reconnect
      connectTimeout: 15000,
      rejectUnauthorized: true, // TLS cert verification ON (NFR-SE-03)
    });
    this.client = client;

    client.on('connect', () => {
      for (const serial of this.config.serials) {
        client.subscribe(`device/${serial}/report`, { qos: 0 });
      }
      this.emit({ kind: 'connected' });
    });

    client.on('message', (topic, payload) => {
      try {
        const serial = topic.split('/')[1] ?? '';
        const raw = JSON.parse(payload.toString());
        const snapshot = this.normalizer.normalizeReport(raw, Date.now());
        if (snapshot) this.emit({ kind: 'snapshot', printerSerial: serial, snapshot });
      } catch {
        // Never let a bad message crash the listener (total error containment).
        this.emit({ kind: 'drift', field: 'report' });
      }
    });

    client.on('error', (err) => {
      const msg = (err as Error).message ?? 'mqtt error';
      // 4xx-style auth failures should trigger reauth, not endless retry.
      if (/not authorized|bad username|auth/i.test(msg)) {
        this.emit({ kind: 'reauth_required' });
      } else {
        this.emit({ kind: 'degraded', detail: msg });
      }
    });

    client.on('close', () => {
      this.emit({ kind: 'degraded', detail: 'connection closed' });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.client) return resolve();
      this.client.end(true, {}, () => resolve());
      this.client = null;
    });
  }
}
