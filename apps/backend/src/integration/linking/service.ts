import type {
  IntegrationSettings,
  IntegrationSettingsPatch,
  IntegrationStatus,
  LinkChallenge,
  Printer,
  RegisterPrinterInput,
  UpdatePrinterInput,
} from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { EventBus } from '../../bus/event-bus.js';
import type { Db } from '../../db/client.js';
import { cloudLink, printer } from '../../db/schema/integration.js';
import { ConflictError, NotFoundError, UpstreamError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';
import { ManualTokenAdapter } from '../bambu/fallback/manual-token.js';
import { RestPollTelemetryAdapter } from '../bambu/fallback/rest-poll-telemetry.js';
import { BambuMqttAdapter } from '../bambu/mqtt-adapter.js';
import { BambuRestAdapter } from '../bambu/rest-adapter.js';
import { Normalizer } from '../normalizer.js';
import type { BambuCloudGateway, TelemetrySource } from '../ports.js';
import type { TelemetrySupervisor } from '../supervisor.js';
import { AesGcmTokenVault } from '../token-vault.js';

const LINK_ID = 'singleton';

export type IntegrationDeps = {
  db: Db;
  bus: EventBus;
  vault: AesGcmTokenVault;
  supervisor: TelemetrySupervisor;
  normalizer: Normalizer;
  mqttRegionOverride: string | undefined;
  /** Fallback toggles set by the MS-1 spike verdict (ADR-012). */
  useManualTokenOnly?: boolean;
  useRestPollTelemetry?: boolean;
  fetchFn?: typeof fetch;
};

/**
 * Integration coordinator (FR-301/306/307). Owns cloud_link, adapter selection
 * (primary vs. fallback per MS-1), token vault, and printer registry. The only
 * module allowed to reference integration/bambu adapters.
 */
export class IntegrationService {
  private gateway: BambuCloudGateway;

  constructor(private readonly deps: IntegrationDeps) {
    this.gateway = deps.useManualTokenOnly
      ? new ManualTokenAdapter(deps.normalizer, deps.fetchFn ?? fetch)
      : new BambuRestAdapter(deps.normalizer, deps.fetchFn ?? fetch);
  }

  private link(): typeof cloudLink.$inferSelect {
    let row = this.deps.db.select().from(cloudLink).where(eq(cloudLink.id, LINK_ID)).get();
    if (!row) {
      this.deps.db
        .insert(cloudLink)
        .values({
          id: LINK_ID,
          state: 'unlinked',
          authMode: 'password',
          mqttRegion: 'us',
          integrationEnabled: 1,
          taskSyncIntervalMin: 30,
        })
        .run();
      row = this.deps.db.select().from(cloudLink).where(eq(cloudLink.id, LINK_ID)).get()!;
    }
    return row;
  }

  status(): IntegrationStatus {
    const l = this.link();
    const sup = this.deps.supervisor.getState();
    return {
      state: l.state as IntegrationStatus['state'],
      enabled: l.integrationEnabled === 1,
      authMode: l.authMode as IntegrationStatus['authMode'],
      bambuUid: l.bambuUid,
      mqttRegion: this.deps.mqttRegionOverride ?? l.mqttRegion,
      linkedAt: l.linkedAt != null ? new Date(l.linkedAt).toISOString() : null,
      tokenIssuedAt: l.tokenIssuedAt != null ? new Date(l.tokenIssuedAt).toISOString() : null,
      rest: {
        lastSuccessAt:
          l.lastRestSuccessAt != null ? new Date(l.lastRestSuccessAt).toISOString() : null,
        lastErrorClass: l.lastErrorClass,
      },
      mqtt: {
        listenerState: sup.listenerState,
        connectedSince:
          l.mqttConnectedSince != null ? new Date(l.mqttConnectedSince).toISOString() : null,
        lastMessageAt:
          l.lastMqttMessageAt != null ? new Date(l.lastMqttMessageAt).toISOString() : null,
        nextRetryAt: sup.nextRetryAt,
      },
      driftCounter: this.deps.normalizer.getDriftCounter(),
    };
  }

  settings(): IntegrationSettings {
    const l = this.link();
    return {
      enabled: l.integrationEnabled === 1,
      mqttRegion: l.mqttRegion,
      taskSyncIntervalMin: l.taskSyncIntervalMin,
    };
  }

  /**
   * Re-evaluate the telemetry source (current token + tracked printers) and
   * (re)start the supervisor. MUST be used after any link/token/printer/settings
   * change: supervisor.restart() alone reuses the source factory captured at boot,
   * so a printer or link added at runtime would never actually arm the listener.
   */
  private rearm(): void {
    this.deps.supervisor.configure(this.makeTelemetrySource());
  }

  updateSettings(patch: IntegrationSettingsPatch): IntegrationSettings {
    const l = this.link();
    this.deps.db
      .update(cloudLink)
      .set({
        ...(patch.enabled !== undefined ? { integrationEnabled: patch.enabled ? 1 : 0 } : {}),
        ...(patch.mqttRegion !== undefined ? { mqttRegion: patch.mqttRegion } : {}),
        ...(patch.taskSyncIntervalMin !== undefined
          ? { taskSyncIntervalMin: patch.taskSyncIntervalMin }
          : {}),
      })
      .where(eq(cloudLink.id, l.id))
      .run();
    this.rearm(); // listener reconnects on change
    return this.settings();
  }

  async linkAccount(email: string, password: string): Promise<IntegrationStatus | LinkChallenge> {
    let result: Awaited<ReturnType<BambuCloudGateway['login']>>;
    try {
      result = await this.gateway.login(email, password);
    } catch (_err) {
      this.recordError('login_failed');
      throw new UpstreamError('LINK_FAILED', 'Could not link Bambu account');
    }
    if (result.kind === 'code_required') {
      return { state: 'code_required', challengeId: result.challengeId };
    }
    this.persistTokens(result.bambuUid, result.accessToken, result.refreshToken, 'password');
    await this.refreshPrinters();
    this.rearm();
    return this.status();
  }

  async verifyCode(challengeId: string, code: string): Promise<IntegrationStatus> {
    let result: Awaited<ReturnType<BambuCloudGateway['verifyCode']>>;
    try {
      result = await this.gateway.verifyCode(challengeId, code);
    } catch {
      throw new UpstreamError('VERIFY_FAILED', 'Verification failed');
    }
    if (result.kind !== 'linked') throw new UpstreamError('VERIFY_FAILED', 'Verification failed');
    this.persistTokens(result.bambuUid, result.accessToken, result.refreshToken, 'password');
    await this.refreshPrinters();
    this.rearm();
    return this.status();
  }

  linkWithManualToken(
    bambuUid: string,
    accessToken: string,
    refreshToken?: string,
  ): IntegrationStatus {
    this.gateway = new ManualTokenAdapter(this.deps.normalizer, this.deps.fetchFn ?? fetch);
    this.persistTokens(bambuUid, accessToken, refreshToken, 'manual_token');
    void this.refreshPrinters().catch(() => undefined);
    this.rearm();
    return this.status();
  }

  unlink(): void {
    const l = this.link();
    this.deps.db
      .update(cloudLink)
      .set({
        state: 'unlinked',
        bambuUid: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        linkedAt: null,
        tokenIssuedAt: null,
        mqttConnectedSince: null,
      })
      .where(eq(cloudLink.id, l.id))
      .run();
    void this.deps.supervisor.stop();
  }

  private persistTokens(
    uid: string,
    accessToken: string,
    refreshToken: string | undefined,
    mode: 'password' | 'manual_token',
  ): void {
    const l = this.link();
    const now = nowMs();
    this.deps.db
      .update(cloudLink)
      .set({
        bambuUid: uid,
        accessTokenEnc: this.deps.vault.encrypt(accessToken),
        refreshTokenEnc: refreshToken ? this.deps.vault.encrypt(refreshToken) : null,
        state: 'linked',
        authMode: mode,
        linkedAt: now,
        tokenIssuedAt: now,
        lastRestSuccessAt: now,
        lastErrorClass: null,
      })
      .where(eq(cloudLink.id, l.id))
      .run();
  }

  private recordError(cls: string): void {
    const l = this.link();
    this.deps.db.update(cloudLink).set({ lastErrorClass: cls }).where(eq(cloudLink.id, l.id)).run();
  }

  /** Decrypt the stored access token, or null when unlinked. */
  accessToken(): string | null {
    const l = this.link();
    if (!l.accessTokenEnc) return null;
    try {
      return this.deps.vault.decrypt(Buffer.from(l.accessTokenEnc as Buffer));
    } catch {
      return null;
    }
  }

  gatewayRef(): BambuCloudGateway {
    return this.gateway;
  }

  // ---- printers (FR-302) ----
  listPrinters(): Printer[] {
    return this.deps.db.select().from(printer).all().map(this.toPrinter);
  }

  registerManually(input: RegisterPrinterInput): Printer {
    const exists = this.deps.db
      .select()
      .from(printer)
      .where(eq(printer.serial, input.serial))
      .get();
    if (exists)
      throw new ConflictError('SERIAL_EXISTS', 'A printer with this serial already exists');
    const id = newId();
    this.deps.db
      .insert(printer)
      .values({
        id,
        serial: input.serial,
        name: input.name,
        model: input.model ?? null,
        registration: 'manual',
        tracked: 1,
        onlineFlag: 0,
        lastSeenAt: null,
      })
      .run();
    this.rearm();
    return this.getPrinter(id);
  }

  updatePrinter(id: string, patch: UpdatePrinterInput): Printer {
    this.getPrinter(id);
    this.deps.db
      .update(printer)
      .set({
        ...(patch.tracked !== undefined ? { tracked: patch.tracked ? 1 : 0 } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
      })
      .where(eq(printer.id, id))
      .run();
    if (patch.tracked !== undefined) this.rearm();
    return this.getPrinter(id);
  }

  getPrinter(id: string): Printer {
    const row = this.deps.db.select().from(printer).where(eq(printer.id, id)).get();
    if (!row) throw new NotFoundError('Printer');
    return this.toPrinter(row);
  }

  /** Discovery via bind endpoint; upserts by serial (FR-302 AC-302.2). */
  async refreshPrinters(): Promise<Printer[]> {
    const token = this.accessToken();
    if (!token) throw new UpstreamError('NOT_LINKED', 'No Bambu account linked');
    let descriptors: Awaited<ReturnType<BambuCloudGateway['listDevices']>>;
    try {
      descriptors = await this.gateway.listDevices(token);
    } catch (err) {
      // An upstream 401 triggers reauth (ES-302.1).
      if (String((err as Error).message).includes('401')) {
        this.deps.db.update(cloudLink).set({ state: 'reauth_required' }).run();
      }
      this.recordError('bind_failed');
      throw new UpstreamError('DISCOVERY_FAILED', 'Printer discovery failed');
    }
    for (const d of descriptors) {
      const existing = this.deps.db
        .select()
        .from(printer)
        .where(eq(printer.serial, d.serial))
        .get();
      if (existing) {
        this.deps.db
          .update(printer)
          .set({ name: d.name, model: d.model, lastSeenAt: nowMs() })
          .where(eq(printer.id, existing.id))
          .run();
      } else {
        this.deps.db
          .insert(printer)
          .values({
            id: newId(),
            serial: d.serial,
            name: d.name,
            model: d.model,
            registration: 'discovered',
            tracked: 1,
            onlineFlag: 0,
            lastSeenAt: nowMs(),
          })
          .run();
      }
    }
    this.deps.db.update(cloudLink).set({ lastRestSuccessAt: nowMs() }).run();
    this.rearm();
    return this.listPrinters();
  }

  /** Build the telemetry source for the supervisor based on current link + fallback config. */
  makeTelemetrySource(): (() => TelemetrySource) | null {
    const token = this.accessToken();
    const l = this.link();
    if (!token || !l.bambuUid) return null;
    const serials = this.deps.db
      .select({ serial: printer.serial })
      .from(printer)
      .where(eq(printer.tracked, 1))
      .all()
      .map((r) => r.serial);
    if (serials.length === 0) return null;
    const region = this.deps.mqttRegionOverride ?? l.mqttRegion;

    if (this.deps.useRestPollTelemetry) {
      return () => new RestPollTelemetryAdapter(this.gateway, { accessToken: token, serials });
    }
    return () =>
      new BambuMqttAdapter(
        { region, bambuUid: l.bambuUid!, accessToken: token, serials },
        this.deps.normalizer,
        undefined,
      );
  }

  private toPrinter = (r: typeof printer.$inferSelect): Printer => ({
    id: r.id,
    serial: r.serial,
    name: r.name,
    model: r.model,
    registration: r.registration as 'discovered' | 'manual',
    tracked: r.tracked === 1,
    online: r.onlineFlag === 1,
    lastSeenAt: r.lastSeenAt != null ? new Date(r.lastSeenAt).toISOString() : null,
  });
}
