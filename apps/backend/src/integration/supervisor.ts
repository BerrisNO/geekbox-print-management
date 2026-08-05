import type { ListenerState, TelemetrySnapshot } from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { EventBus } from '../bus/event-bus.js';
import type { Db } from '../db/client.js';
import { cloudLink, printer, telemetrySnapshot } from '../db/schema/integration.js';
import { amsSlotMapping } from '../db/schema/inventory.js';
import { newId, nowMs } from '../shared/ids.js';
import type { Logger } from '../shared/logger.js';
import type { TelemetryEvent, TelemetrySource } from './ports.js';

/**
 * Telemetry supervisor (ADR-004). Total error containment: no listener error
 * reaches the process (NFR-RE-05). Owns reconnect backoff (5s→×2→max 5min, full
 * jitter). Honors the integration.enabled kill switch. Feeds the health panel.
 */
export class TelemetrySupervisor {
  private state: ListenerState = 'stopped';
  private source: TelemetrySource | null = null;
  private makeSource: (() => TelemetrySource) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = 5000;
  private nextRetryAt: number | null = null;

  constructor(
    private readonly db: Db,
    private readonly bus: EventBus,
    private readonly log: Logger,
  ) {}

  getState(): { listenerState: ListenerState; nextRetryAt: string | null } {
    return {
      listenerState: this.state,
      nextRetryAt: this.nextRetryAt != null ? new Date(this.nextRetryAt).toISOString() : null,
    };
  }

  /** (Re)configure the source factory and (re)start according to the kill switch. */
  configure(makeSource: (() => TelemetrySource) | null): void {
    this.makeSource = makeSource;
    void this.restart();
  }

  private killSwitchOn(): boolean {
    const link = this.db.select().from(cloudLink).get();
    return link?.integrationEnabled === 1;
  }

  async restart(): Promise<void> {
    await this.stop();
    if (!this.makeSource) {
      this.setState('stopped');
      return;
    }
    if (!this.killSwitchOn()) {
      this.setState('disabled');
      this.bus.publish({
        type: 'IntegrationStateChanged',
        state: 'disabled',
        detail: 'Integration disabled',
        nextRetryAt: null,
      });
      return;
    }
    this.retryDelayMs = 5000;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.makeSource) return;
    try {
      const source = this.makeSource();
      this.source = source;
      source.on((e) => this.onEvent(e));
      await source.start();
    } catch (err) {
      this.log.warn({ err }, 'Telemetry source start failed');
      this.scheduleRetry();
    }
  }

  private onEvent(e: TelemetryEvent): void {
    try {
      switch (e.kind) {
        case 'connected':
          this.retryDelayMs = 5000;
          this.nextRetryAt = null;
          this.setState('running');
          this.touchLink({ mqttConnectedSince: nowMs() });
          this.bus.publish({
            type: 'IntegrationStateChanged',
            state: 'connected',
            detail: 'Connected',
            nextRetryAt: null,
          });
          break;
        case 'snapshot':
          this.ingestSnapshot(e.printerSerial, e.snapshot);
          break;
        case 'degraded':
          this.setState('degraded');
          this.bus.publish({
            type: 'IntegrationStateChanged',
            state: 'degraded',
            detail: e.detail,
            nextRetryAt: this.nextRetryAt != null ? new Date(this.nextRetryAt).toISOString() : null,
          });
          this.scheduleRetry();
          break;
        case 'reauth_required':
          this.setState('stopped');
          this.db.update(cloudLink).set({ state: 'reauth_required' }).run();
          this.bus.publish({
            type: 'IntegrationStateChanged',
            state: 'reauth_required',
            detail: 'Re-authentication required',
            nextRetryAt: null,
          });
          void this.stop(); // stop retrying; hand over to FR-307 reauth flow
          break;
        case 'drift':
          this.log.warn({ field: e.field }, 'Telemetry drift');
          break;
      }
    } catch (err) {
      this.log.error({ err }, 'Supervisor event handling error (contained)');
    }
  }

  private ingestSnapshot(serial: string, snap: Omit<TelemetrySnapshot, 'printerId'>): void {
    const p = this.db.select().from(printer).where(eq(printer.serial, serial)).get();
    if (!p) return; // unknown printer; ignore
    const capturedAt = new Date(snap.capturedAt).getTime();
    const amsJson = snap.ams ? JSON.stringify(snap.ams) : null;
    // UPSERT latest snapshot (ADR-008).
    const existing = this.db
      .select()
      .from(telemetrySnapshot)
      .where(eq(telemetrySnapshot.printerId, p.id))
      .get();
    const values = {
      printerId: p.id,
      capturedAt,
      printerState: snap.printerState,
      taskName: snap.taskName,
      progressPct: snap.progressPct,
      currentLayer: snap.currentLayer,
      totalLayers: snap.totalLayers,
      remainingTimeMin: snap.remainingTimeMin,
      nozzleTempC: snap.nozzleTempC,
      bedTempC: snap.bedTempC,
      chamberTempC: snap.chamberTempC,
      amsJson,
    };
    if (existing) {
      this.db
        .update(telemetrySnapshot)
        .set(values)
        .where(eq(telemetrySnapshot.printerId, p.id))
        .run();
    } else {
      this.db.insert(telemetrySnapshot).values(values).run();
    }
    this.db
      .update(printer)
      .set({ onlineFlag: 1, lastSeenAt: nowMs() })
      .where(eq(printer.id, p.id))
      .run();
    this.touchLink({ lastMqttMessageAt: nowMs() });

    // Tray-content verification (AC-305.3): flag mappings whose observed tray differs.
    this.verifyMappings(p.id, snap.ams);

    this.bus.publish({
      type: 'TelemetrySnapshotUpdated',
      printerId: p.id,
      snapshot: { ...snap, printerId: p.id },
    });
  }

  private verifyMappings(printerId: string, ams: TelemetrySnapshot['ams']): void {
    if (!ams) return;
    const mappings = this.db
      .select()
      .from(amsSlotMapping)
      .where(eq(amsSlotMapping.printerId, printerId))
      .all();
    for (const unit of ams.units) {
      for (const slot of unit.slots) {
        const m = mappings.find(
          (mm) => mm.unitIndex === unit.unitIndex && mm.slotIndex === slot.slotIndex,
        );
        if (!m) continue;
        // If tray observed empty while mapped, flag for verification.
        if (slot.trayType == null && m.verifyFlag === 0) {
          this.db
            .update(amsSlotMapping)
            .set({ verifyFlag: 1, verifyReason: 'tray_mismatch' })
            .where(eq(amsSlotMapping.id, m.id))
            .run();
          this.bus.publish({
            type: 'MappingVerifyFlagged',
            printerId,
            slotRef: `${unit.unitIndex}:${slot.slotIndex}`,
            reason: 'tray_mismatch',
          });
        }
      }
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const jitter = Math.random() * this.retryDelayMs;
    const delay = Math.min(this.retryDelayMs + jitter, 5 * 60 * 1000);
    this.nextRetryAt = nowMs() + delay;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, 5 * 60 * 1000);
      void (async () => {
        await this.stopSource();
        if (this.killSwitchOn()) await this.connect();
      })();
    }, delay);
  }

  private touchLink(patch: Partial<typeof cloudLink.$inferInsert>): void {
    const link = this.db.select().from(cloudLink).get();
    if (link) this.db.update(cloudLink).set(patch).where(eq(cloudLink.id, link.id)).run();
  }

  private setState(s: ListenerState): void {
    this.state = s;
  }

  private async stopSource(): Promise<void> {
    if (this.source) {
      try {
        await this.source.stop();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
  }

  async stop(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.nextRetryAt = null;
    await this.stopSource();
    if (this.state !== 'disabled') this.setState('stopped');
  }
}

export { newId };
