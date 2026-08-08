import type { SyncResult, TelemetrySnapshot } from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { cloudLink, printer, telemetrySnapshot } from '../db/schema/integration.js';
import type { CoverCache } from '../jobs/job/cover-cache.js';
import type { JobService } from '../jobs/job/service.js';
import { NotFoundError, UpstreamError } from '../shared/errors/index.js';
import type { IntegrationService } from './linking/service.js';

/**
 * Task history sync (FR-308). Idempotent upsert by bambu_task_id. Scheduled at
 * >= taskSyncIntervalMin (A-05); also invokable on demand. Runs behind the ACL.
 */
export class TaskSyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private finishTimers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly db: Db,
    private readonly integration: IntegrationService,
    private readonly jobs: JobService,
    private readonly covers: CoverCache,
  ) {}

  async sync(): Promise<SyncResult> {
    const token = this.integration.accessToken();
    if (!token) throw new UpstreamError('NOT_LINKED', 'No Bambu account linked');
    const link = this.db.select().from(cloudLink).get();
    if (link?.integrationEnabled !== 1)
      throw new UpstreamError('INTEGRATION_DISABLED', 'Integration is disabled');

    let tasks: Awaited<ReturnType<ReturnType<IntegrationService['gatewayRef']>['fetchTasks']>>;
    try {
      tasks = await this.integration.gatewayRef().fetchTasks(token);
    } catch {
      this.db.update(cloudLink).set({ lastErrorClass: 'task_sync_failed' }).run();
      throw new UpstreamError('SYNC_FAILED', 'Task sync failed (ES-308.1)');
    }

    let created = 0;
    let merged = 0;
    for (const t of tasks) {
      const res = this.jobs.upsertFromTask(t);
      if (res.created) created += 1;
      else merged += 1;
    }
    this.db.update(cloudLink).set({ lastRestSuccessAt: Date.now() }).run();
    // Cache any new cover images (best-effort, outside the write path).
    await this.covers.cacheMissing().catch(() => undefined);
    return { fetched: tasks.length, created, merged };
  }

  startScheduler(): void {
    const link = this.db.select().from(cloudLink).get();
    const intervalMin = Math.max(30, link?.taskSyncIntervalMin ?? 30);
    this.stopScheduler();
    this.timer = setInterval(
      () => {
        void this.sync().catch(() => undefined);
      },
      intervalMin * 60 * 1000,
    );
  }

  stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.finishTimers) clearTimeout(t);
    this.finishTimers = [];
  }

  /**
   * A print just finished (telemetry transition). Sync promptly with staggered
   * retries — the Bambu cloud can lag a minute or two before the finished task
   * shows up in /my/tasks. Replaces any pending finish burst (idempotent syncs).
   */
  scheduleFinishSyncs(delaysMs: number[] = [20_000, 2 * 60_000, 8 * 60_000, 20 * 60_000]): void {
    for (const t of this.finishTimers) clearTimeout(t);
    this.finishTimers = delaysMs.map((delay) =>
      setTimeout(() => {
        void this.sync().catch(() => undefined);
      }, delay),
    );
  }

  getSnapshot(printerId: string): TelemetrySnapshot {
    const p = this.db.select().from(printer).where(eq(printer.id, printerId)).get();
    if (!p) throw new NotFoundError('Printer');
    const snap = this.db
      .select()
      .from(telemetrySnapshot)
      .where(eq(telemetrySnapshot.printerId, printerId))
      .get();
    if (!snap) throw new NotFoundError('Telemetry snapshot');
    return {
      printerId,
      capturedAt: new Date(snap.capturedAt).toISOString(),
      printerState: snap.printerState as TelemetrySnapshot['printerState'],
      taskName: snap.taskName,
      progressPct: snap.progressPct,
      currentLayer: snap.currentLayer,
      totalLayers: snap.totalLayers,
      remainingTimeMin: snap.remainingTimeMin,
      nozzleTempC: snap.nozzleTempC,
      bedTempC: snap.bedTempC,
      chamberTempC: snap.chamberTempC,
      ams: snap.amsJson ? JSON.parse(snap.amsJson) : null,
    };
  }
}
