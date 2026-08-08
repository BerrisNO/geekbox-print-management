import type {
  AttributeResult,
  FilamentUsage,
  JobCorrectionInput,
  JobListResponse,
  JobOutcome,
  ManualJobInput,
  PrintJob,
  PrintJobDetail,
} from '@geekbox/shared';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import type { EventBus } from '../../bus/event-bus.js';
import type { Db } from '../../db/client.js';
import { printer } from '../../db/schema/integration.js';
import { spool, spoolLedgerEntry } from '../../db/schema/inventory.js';
import { filamentUsage, printJob } from '../../db/schema/jobs.js';
import type { TaskRecord } from '../../integration/ports.js';
import type { AmsMappingService } from '../../inventory/ams-mapping/service.js';
import type { LedgerWriter } from '../../inventory/ledger/ledger-write.js';
import { toLedgerEntry } from '../../inventory/spool/service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';
import type { CostingService } from '../costing/service.js';

/**
 * Print jobs (FR-401/405/406), consumption attribution (FR-402), and job merge.
 * All deductions post through the single LedgerWriter path (ADR-009).
 */
export class JobService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerWriter,
    private readonly costing: CostingService,
    readonly _ams: AmsMappingService,
    private readonly bus: EventBus,
    /** consumption.autopost flag (plan §7 / RISK-005). When false, deductions are pending-preview. */
    private autopost = true,
  ) {}

  setAutopost(v: boolean): void {
    this.autopost = v;
  }

  list(filter: {
    printerId?: string;
    outcome?: string;
    from?: string;
    to?: string;
    sort?: 'date' | 'cost';
  }): JobListResponse {
    let rows = this.db.select().from(printJob).all();
    if (filter.printerId) rows = rows.filter((r) => r.printerId === filter.printerId);
    if (filter.outcome) rows = rows.filter((r) => r.outcome === filter.outcome);
    if (filter.from) {
      const fromMs = new Date(filter.from).getTime();
      rows = rows.filter((r) => (r.startedAt ?? r.createdAt) >= fromMs);
    }
    if (filter.to) {
      const toMs = new Date(filter.to).getTime() + 24 * 60 * 60 * 1000;
      rows = rows.filter((r) => (r.startedAt ?? r.createdAt) <= toMs);
    }
    const jobs = rows.map((r) => this.toJob(r));
    if (filter.sort === 'cost') {
      jobs.sort((a, b) => (b.cost?.totalCostMinor ?? 0) - (a.cost?.totalCostMinor ?? 0));
    } else {
      jobs.sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt));
    }
    const successCount = jobs.filter((j) => j.outcome === 'success').length;
    const summary = {
      count: jobs.length,
      successCount,
      successRatePct: jobs.length > 0 ? (successCount / jobs.length) * 100 : 0,
      totalUsedG: jobs.reduce((a, j) => a + j.totalUsedG, 0),
      totalCostMinor: jobs.reduce((a, j) => a + (j.cost?.totalCostMinor ?? 0), 0),
      incompleteCostCount: jobs.filter((j) => j.cost?.incomplete).length,
    };
    return { jobs, summary };
  }

  get(id: string): PrintJobDetail {
    const row = this.db.select().from(printJob).where(eq(printJob.id, id)).get();
    if (!row) throw new NotFoundError('Job');
    const usages = this.usagesFor(id);
    return { ...this.toJob(row), usages, costBreakdown: this.costing.currentCost(id) };
  }

  /** Manual job entry (FR-405). Posts ledger entries through the single write path. */
  createManual(input: ManualJobInput): PrintJobDetail {
    const id = newId();
    const now = nowMs();
    this.db
      .insert(printJob)
      .values({
        id,
        source: 'manual',
        bambuTaskId: null,
        printerId: input.printerId ?? null,
        jobName: input.jobName,
        startedAt: input.startedAt ? new Date(input.startedAt).getTime() : null,
        endedAt: input.endedAt ? new Date(input.endedAt).getTime() : null,
        durationMin: input.durationMin ?? null,
        outcome: input.outcome,
        usageStatus: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    let slotSeq = 0;
    for (const u of input.usages ?? []) {
      const usageId = newId();
      const slotRef = `manual:${slotSeq++}`;
      this.db
        .insert(filamentUsage)
        .values({
          id: usageId,
          jobId: id,
          slotRef,
          spoolId: u.spoolId ?? null,
          usedG: u.usedG,
          usedMm: null,
          estimated: 0,
          attributed: u.spoolId ? 0 : 0,
          ledgerEntryId: null,
        })
        .run();
      if (u.spoolId) {
        this.postOrPreview({
          usageId,
          spoolId: u.spoolId,
          jobId: id,
          slotRef,
          grams: u.usedG,
          estimated: false,
        });
      }
    }

    this.costing.recalculate(id);
    this.bus.publish({ type: 'PrintJobObserved', jobId: id, kind: 'created' });
    return this.get(id);
  }

  /** Attribute an unattributed usage to a spool (ES-402.2) — posts under the (job,slot) guard. */
  attribute(jobId: string, usageId: string, spoolId: string): AttributeResult {
    const usage = this.db.select().from(filamentUsage).where(eq(filamentUsage.id, usageId)).get();
    if (!usage || usage.jobId !== jobId) throw new NotFoundError('Usage');
    if (usage.ledgerEntryId)
      throw new ConflictError('ALREADY_ATTRIBUTED', 'Usage already attributed');
    const grams = usage.usedG ?? 0;
    if (grams <= 0) throw new ValidationError('Usage has no weight to attribute');
    const { entryId } = this.ledger.postConsumption({
      spoolId,
      jobId,
      slotRef: usage.slotRef,
      usageId,
      grams,
      estimated: usage.estimated === 1,
    });
    this.costing.recalculate(jobId);
    const entry = this.db
      .select()
      .from(spoolLedgerEntry)
      .where(eq(spoolLedgerEntry.id, entryId))
      .get()!;
    const updated = this.usagesFor(jobId).find((u) => u.id === usageId)!;
    this.bus.publish({
      type: 'FilamentConsumptionRecorded',
      jobId,
      spoolId,
      slotRef: usage.slotRef,
      grams,
      estimated: usage.estimated === 1,
      pending: false,
    });
    return { usage: updated, entry: toLedgerEntry(entry) };
  }

  /** Correction (FR-405 AC-405.2): reverse-and-repost, never mutate the ledger. */
  correct(jobId: string, input: JobCorrectionInput): PrintJobDetail {
    const job = this.db.select().from(printJob).where(eq(printJob.id, jobId)).get();
    if (!job) throw new NotFoundError('Job');
    this.db
      .update(printJob)
      .set({
        ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
        ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
        updatedAt: nowMs(),
      })
      .where(eq(printJob.id, jobId))
      .run();

    for (const u of input.usages ?? []) {
      if (!u.usageId) continue;
      const usage = this.db
        .select()
        .from(filamentUsage)
        .where(eq(filamentUsage.id, u.usageId))
        .get();
      if (!usage) continue;
      const newSpoolId = u.spoolId ?? usage.spoolId;
      const newGrams = u.usedG ?? usage.usedG ?? 0;
      if (!newSpoolId) {
        this.db
          .update(filamentUsage)
          .set({ usedG: newGrams })
          .where(eq(filamentUsage.id, u.usageId))
          .run();
        continue;
      }
      const targetSpool = this.db.select().from(spool).where(eq(spool.id, newSpoolId)).get();
      if (targetSpool?.status === 'archived' && !u.confirmArchivedSpool) {
        throw new ConflictError(
          'SPOOL_ARCHIVED',
          'Target spool is archived; confirm to proceed (ES-405.1)',
        );
      }
      this.ledger.correctConsumption({
        usageId: u.usageId,
        newSpoolId,
        newGrams,
        jobId,
        slotRef: usage.slotRef,
        estimated: usage.estimated === 1,
        note: 'Job correction',
      });
    }

    this.costing.recalculate(jobId);
    this.bus.publish({ type: 'PrintJobObserved', jobId, kind: 'merged' });
    return this.get(jobId);
  }

  exportCsv(filter: Parameters<JobService['list']>[0]): string {
    const { jobs } = this.list(filter);
    const header = [
      'id',
      'jobName',
      'printerName',
      'startedAt',
      'outcome',
      'totalUsedG',
      'totalCostMinor',
      'costIncomplete',
    ];
    const lines = [header.join(',')];
    for (const j of jobs) {
      lines.push(
        [
          j.id,
          csvEscape(j.jobName),
          csvEscape(j.printerName ?? ''),
          j.startedAt ?? '',
          j.outcome,
          j.totalUsedG.toFixed(2),
          j.cost?.totalCostMinor ?? '',
          j.cost?.incomplete ? 'yes' : 'no',
        ].join(','),
      );
    }
    return lines.join('\n');
  }

  /**
   * Upsert a job from a normalized task record (FR-308/401). Idempotent by
   * bambu_task_id; telemetry-only completions merge on (printer, ±10min window).
   * Also captures the cover image URL, total weight, and per-slot filament usages,
   * backfilling existing jobs on re-sync (without disturbing confirmed attributions).
   */
  upsertFromTask(task: TaskRecord): { jobId: string; created: boolean } {
    const existing = this.db
      .select()
      .from(printJob)
      .where(eq(printJob.bambuTaskId, task.bambuTaskId))
      .get();
    let printerId: string | null = null;
    if (task.printerSerial) {
      printerId =
        this.db
          .select({ id: printer.id })
          .from(printer)
          .where(eq(printer.serial, task.printerSerial))
          .get()?.id ?? null;
    }
    // Only overwrite the cached-cover flag when a new/different URL arrives, so a
    // re-sync doesn't force a re-download of an already-cached image.
    const coverPatch = (currentUrl: string | null): Record<string, unknown> =>
      task.coverUrl && task.coverUrl !== currentUrl
        ? { coverUrl: task.coverUrl, coverCached: 0 }
        : {};

    let result: { jobId: string; created: boolean };
    if (existing) {
      this.db
        .update(printJob)
        .set({
          ...(task.jobName ? { jobName: task.jobName } : {}),
          ...(task.startedAt ? { startedAt: task.startedAt } : {}),
          ...(task.endedAt ? { endedAt: task.endedAt } : {}),
          ...(task.durationMin != null ? { durationMin: task.durationMin } : {}),
          ...(task.outcome ? { outcome: task.outcome } : {}),
          ...(printerId ? { printerId } : {}),
          ...(task.totalWeightG != null ? { totalWeightG: task.totalWeightG } : {}),
          ...(task.totalLengthMm != null ? { totalLengthMm: task.totalLengthMm } : {}),
          ...(task.bedType ? { bedType: task.bedType } : {}),
          ...(task.plateIndex != null ? { plateIndex: task.plateIndex } : {}),
          ...coverPatch(existing.coverUrl),
          updatedAt: nowMs(),
        })
        .where(eq(printJob.id, existing.id))
        .run();
      result = { jobId: existing.id, created: false };
    } else {
      result = this.insertOrAdoptTask(task, printerId, coverPatch);
    }

    const usagesChanged = this.reconcileTaskUsages(result.jobId, printerId, task.usages ?? []);
    // Auto-attribute usages whose slot had a spool mapped BEFORE the job started —
    // that spool was the one loaded, so the deduction is safe to post automatically.
    // Older jobs (pre-mapping) are left unattributed with a suggestion instead.
    const autoPosted = this.autoAttributeTaskUsages(
      result.jobId,
      printerId,
      task.startedAt ?? task.endedAt ?? null,
    );
    // Recalculate + notify only when there's something new — avoids a fresh
    // (superseded) cost snapshot and an SSE storm on every no-op re-sync.
    if (result.created || usagesChanged || autoPosted) {
      this.costing.recalculate(result.jobId);
      this.bus.publish({
        type: 'PrintJobObserved',
        jobId: result.jobId,
        kind: result.created ? 'created' : 'merged',
      });
    }
    return result;
  }

  /**
   * A print started (telemetry transition). Opens a provisional telemetry job so
   * the list shows the print immediately — the Bambu cloud task list lags and can
   * omit the newest task for a long while. Task sync later adopts this row via
   * the merge window and enriches it with cover/filament/outcome.
   */
  telemetryPrintStarted(printerId: string, taskName: string | null, atMs: number): void {
    const open = this.openTelemetryJob(printerId);
    if (open) {
      if ((taskName ?? '') === open.jobName) return; // already tracking this print
      // A different print started while one was open (missed finish) — close the
      // stale one as unknown before opening the new job.
      this.db
        .update(printJob)
        .set({ endedAt: atMs, updatedAt: nowMs() })
        .where(eq(printJob.id, open.id))
        .run();
    }
    const id = newId();
    const now = nowMs();
    this.db
      .insert(printJob)
      .values({
        id,
        source: 'telemetry',
        bambuTaskId: null,
        printerId,
        jobName: taskName ?? '',
        startedAt: atMs,
        endedAt: null,
        durationMin: null,
        outcome: 'unknown',
        usageStatus: 'unknown',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    this.bus.publish({ type: 'PrintJobObserved', jobId: id, kind: 'created' });
  }

  /**
   * A print left the printing state (telemetry transition). Closes the open
   * telemetry job with a best-effort outcome: error → failed; idle at ~100% →
   * success; idle below that → cancelled. If no open job exists (started before
   * boot), a closed telemetry job is created so the print still shows up.
   */
  telemetryPrintFinished(
    printerId: string,
    endState: 'idle' | 'error',
    progressPct: number | null,
    atMs: number,
  ): void {
    const outcome: JobOutcome =
      endState === 'error' ? 'failed' : (progressPct ?? 0) >= 99 ? 'success' : 'cancelled';
    const open = this.openTelemetryJob(printerId);
    if (open) {
      const durationMin = open.startedAt != null ? (atMs - open.startedAt) / 60_000 : null;
      this.db
        .update(printJob)
        .set({ endedAt: atMs, durationMin, outcome, updatedAt: nowMs() })
        .where(eq(printJob.id, open.id))
        .run();
      this.costing.recalculate(open.id);
      this.bus.publish({ type: 'PrintJobObserved', jobId: open.id, kind: 'merged' });
      return;
    }
    const id = newId();
    const now = nowMs();
    this.db
      .insert(printJob)
      .values({
        id,
        source: 'telemetry',
        bambuTaskId: null,
        printerId,
        jobName: '',
        startedAt: null,
        endedAt: atMs,
        durationMin: null,
        outcome,
        usageStatus: 'unknown',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    this.bus.publish({ type: 'PrintJobObserved', jobId: id, kind: 'created' });
  }

  /** The printer's currently-open telemetry job (no end time), if any. */
  private openTelemetryJob(printerId: string): typeof printJob.$inferSelect | undefined {
    return this.db
      .select()
      .from(printJob)
      .where(
        and(
          eq(printJob.printerId, printerId),
          eq(printJob.source, 'telemetry'),
          isNull(printJob.endedAt),
        ),
      )
      .get();
  }

  /**
   * Resolve the spool a task slot should map to: exact slotRef match, or — for the
   * "reported" fallback (no per-slot detail from Bambu) — the printer's single
   * mapping when exactly one exists (single-spool printers without an AMS).
   */
  private resolveMapping(
    printerId: string,
    slotRef: string,
  ): { spoolId: string; mappedAt: number } | null {
    const mappings = this._ams.mappingsForPrinter(printerId);
    if (slotRef === 'reported') {
      return mappings.length === 1 ? (mappings[0] ?? null) : null;
    }
    return mappings.find((m) => m.slotRef === slotRef) ?? null;
  }

  /**
   * Post consumption for unattributed task usages whose slot mapping predates the
   * job start (mappedAt <= startedAt). Idempotent per usage via ledger_entry_id.
   * Returns true when at least one deduction was posted.
   */
  private autoAttributeTaskUsages(
    jobId: string,
    printerId: string | null,
    jobStartMs: number | null,
  ): boolean {
    if (!printerId || jobStartMs == null) return false;
    const rows = this.db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();
    let posted = false;
    for (const row of rows) {
      if (row.ledgerEntryId) continue;
      if (!isTaskSlotRef(row.slotRef)) continue;
      const grams = row.usedG ?? 0;
      if (grams <= 0) continue;
      const mapping = this.resolveMapping(printerId, row.slotRef);
      if (!mapping || mapping.mappedAt > jobStartMs) continue;
      this.postOrPreview({
        usageId: row.id,
        spoolId: mapping.spoolId,
        jobId,
        slotRef: row.slotRef,
        grams,
        estimated: false,
      });
      posted = true;
    }
    return posted;
  }

  private insertOrAdoptTask(
    task: TaskRecord,
    printerId: string | null,
    coverPatch: (currentUrl: string | null) => Record<string, unknown>,
  ): { jobId: string; created: boolean } {
    // Try to adopt a telemetry-observed job: match by start time (±10min), or —
    // for jobs whose start was missed (boot mid-print) — by end time (±10min).
    if (printerId) {
      const windowMs = 10 * 60 * 1000;
      const telemetryOn = (
        col: typeof printJob.startedAt | typeof printJob.endedAt,
        center: number,
      ) =>
        this.db
          .select()
          .from(printJob)
          .where(
            and(
              eq(printJob.printerId, printerId),
              eq(printJob.source, 'telemetry'),
              gte(col, center - windowMs),
              lte(col, center + windowMs),
            ),
          )
          .get();
      let candidate =
        task.startedAt != null ? telemetryOn(printJob.startedAt, task.startedAt) : undefined;
      if (!candidate && task.endedAt != null) {
        candidate = telemetryOn(printJob.endedAt, task.endedAt);
      }
      if (candidate && candidate.bambuTaskId == null) {
        this.db
          .update(printJob)
          .set({
            bambuTaskId: task.bambuTaskId,
            jobName: task.jobName ?? candidate.jobName,
            outcome: task.outcome ?? candidate.outcome,
            // Cloud times are authoritative once the task record exists.
            ...(task.startedAt != null ? { startedAt: task.startedAt } : {}),
            ...(task.endedAt != null ? { endedAt: task.endedAt } : {}),
            ...(task.durationMin != null ? { durationMin: task.durationMin } : {}),
            ...(task.totalWeightG != null ? { totalWeightG: task.totalWeightG } : {}),
            ...(task.totalLengthMm != null ? { totalLengthMm: task.totalLengthMm } : {}),
            ...(task.bedType ? { bedType: task.bedType } : {}),
            ...(task.plateIndex != null ? { plateIndex: task.plateIndex } : {}),
            ...coverPatch(candidate.coverUrl),
            updatedAt: nowMs(),
          })
          .where(eq(printJob.id, candidate.id))
          .run();
        return { jobId: candidate.id, created: false };
      }
    }

    const id = newId();
    const now = nowMs();
    this.db
      .insert(printJob)
      .values({
        id,
        source: 'task_sync',
        bambuTaskId: task.bambuTaskId,
        printerId,
        jobName: task.jobName ?? '',
        startedAt: task.startedAt ?? null,
        endedAt: task.endedAt ?? null,
        durationMin: task.durationMin ?? null,
        outcome: task.outcome ?? 'unknown',
        usageStatus: 'reported',
        totalWeightG: task.totalWeightG ?? null,
        totalLengthMm: task.totalLengthMm ?? null,
        bedType: task.bedType ?? null,
        plateIndex: task.plateIndex ?? null,
        coverUrl: task.coverUrl ?? null,
        coverCached: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { jobId: id, created: true };
  }

  /**
   * Reconcile filament_usage rows against a task's reported per-slot usages
   * (suggest-and-confirm model — never auto-posts the ledger). Keyed by (job,slot):
   *  - attributed rows (with a live ledger entry) are left untouched;
   *  - unattributed rows are updated with fresh grams/type/color;
   *  - new slots are inserted unattributed;
   *  - unattributed rows for slots no longer reported are removed (clears the stale
   *    "reported" fallback once real per-slot detail arrives).
   */
  private reconcileTaskUsages(
    jobId: string,
    _printerId: string | null,
    taskUsages: NonNullable<TaskRecord['usages']>,
  ): boolean {
    const desired = new Map(taskUsages.map((u) => [u.slotRef, u]));
    const existingRows = this.db
      .select()
      .from(filamentUsage)
      .where(eq(filamentUsage.jobId, jobId))
      .all();
    let changed = false;

    for (const row of existingRows) {
      // Preserve rows the user (or a prior sync) already attributed to a spool.
      if (row.ledgerEntryId) {
        desired.delete(row.slotRef);
        continue;
      }
      // Only reconcile task-derived slots; leave manual usages (manual:N) alone.
      if (!isTaskSlotRef(row.slotRef)) continue;
      const want = desired.get(row.slotRef);
      if (!want) {
        this.db.delete(filamentUsage).where(eq(filamentUsage.id, row.id)).run();
        changed = true;
        continue;
      }
      const nextG = want.weightG ?? null;
      const nextType = want.filamentType ?? null;
      const nextColor = want.colorHex ?? null;
      const nextFilamentId = want.filamentId ?? null;
      if (
        row.usedG !== nextG ||
        row.trayType !== nextType ||
        row.colorHex !== nextColor ||
        row.filamentId !== nextFilamentId
      ) {
        this.db
          .update(filamentUsage)
          .set({
            usedG: nextG,
            trayType: nextType,
            colorHex: nextColor,
            filamentId: nextFilamentId,
          })
          .where(eq(filamentUsage.id, row.id))
          .run();
        changed = true;
      }
      desired.delete(row.slotRef);
    }

    // Insert brand-new slots (unattributed — the user confirms before any deduction).
    for (const [slotRef, want] of desired) {
      this.db
        .insert(filamentUsage)
        .values({
          id: newId(),
          jobId,
          slotRef,
          spoolId: null,
          usedG: want.weightG ?? null,
          usedMm: null,
          trayType: want.filamentType ?? null,
          colorHex: want.colorHex ?? null,
          filamentId: want.filamentId ?? null,
          estimated: 0,
          attributed: 0,
          ledgerEntryId: null,
        })
        .run();
      changed = true;
    }
    return changed;
  }

  private postOrPreview(args: {
    usageId: string;
    spoolId: string;
    jobId: string;
    slotRef: string;
    grams: number;
    estimated: boolean;
  }): void {
    if (this.autopost) {
      this.ledger.postConsumption(args);
      this.bus.publish({
        type: 'FilamentConsumptionRecorded',
        jobId: args.jobId,
        spoolId: args.spoolId,
        slotRef: args.slotRef,
        grams: args.grams,
        estimated: args.estimated,
        pending: false,
      });
    } else {
      // Pending-preview: record intent without posting the ledger entry (plan §7).
      this.bus.publish({
        type: 'FilamentConsumptionRecorded',
        jobId: args.jobId,
        spoolId: args.spoolId,
        slotRef: args.slotRef,
        grams: args.grams,
        estimated: args.estimated,
        pending: true,
      });
    }
  }

  private usagesFor(jobId: string): FilamentUsage[] {
    const job = this.db
      .select({ printerId: printJob.printerId })
      .from(printJob)
      .where(eq(printJob.id, jobId))
      .get();
    const printerId = job?.printerId ?? null;
    return this.db
      .select()
      .from(filamentUsage)
      .where(eq(filamentUsage.jobId, jobId))
      .all()
      .map((u) => {
        const label = u.spoolId
          ? (this.db.select({ label: spool.label }).from(spool).where(eq(spool.id, u.spoolId)).get()
              ?.label ?? null)
          : null;
        // Live suggestion: the spool currently mapped to this slot on the job's
        // printer, offered for one-click attribution while the usage is unattributed.
        let suggestedSpoolId: string | null = null;
        let suggestedSpoolLabel: string | null = null;
        if (!u.ledgerEntryId && printerId) {
          suggestedSpoolId = this.resolveMapping(printerId, u.slotRef)?.spoolId ?? null;
          if (suggestedSpoolId) {
            suggestedSpoolLabel =
              this.db
                .select({ label: spool.label })
                .from(spool)
                .where(eq(spool.id, suggestedSpoolId))
                .get()?.label ?? null;
          }
        }
        return {
          id: u.id,
          jobId: u.jobId,
          slotRef: u.slotRef,
          spoolId: u.spoolId,
          spoolLabel: label,
          usedG: u.usedG,
          usedMm: u.usedMm,
          trayType: u.trayType,
          colorHex: u.colorHex,
          filamentId: u.filamentId,
          suggestedSpoolId,
          suggestedSpoolLabel,
          estimated: u.estimated === 1,
          attributed: u.attributed === 1,
          ledgerEntryId: u.ledgerEntryId,
        };
      });
  }

  private toJob(r: typeof printJob.$inferSelect): PrintJob {
    const usages = this.db.select().from(filamentUsage).where(eq(filamentUsage.jobId, r.id)).all();
    const totalUsedG = usages.reduce((a, u) => a + (u.usedG ?? 0), 0);
    const cost = this.costing.currentCost(r.id);
    const printerName = r.printerId
      ? (this.db
          .select({ name: printer.name })
          .from(printer)
          .where(eq(printer.id, r.printerId))
          .get()?.name ?? null)
      : null;
    return {
      id: r.id,
      source: r.source as PrintJob['source'],
      bambuTaskId: r.bambuTaskId,
      printerId: r.printerId,
      printerName,
      jobName: r.jobName,
      startedAt: r.startedAt != null ? new Date(r.startedAt).toISOString() : null,
      endedAt: r.endedAt != null ? new Date(r.endedAt).toISOString() : null,
      durationMin: r.durationMin,
      outcome: r.outcome as JobOutcome,
      usageStatus: r.usageStatus as PrintJob['usageStatus'],
      totalUsedG,
      totalWeightG: r.totalWeightG,
      totalLengthMm: r.totalLengthMm,
      bedType: r.bedType,
      plateIndex: r.plateIndex,
      coverUrl: r.coverCached === 1 ? `/api/jobs/${r.id}/cover` : null,
      usageSummary: usages.map((u) => ({
        trayType: u.trayType,
        colorHex: u.colorHex,
        usedG: u.usedG,
        attributed: u.ledgerEntryId != null,
      })),
      unattributedCount: usages.filter((u) => u.ledgerEntryId == null && (u.usedG ?? 0) > 0).length,
      cost: cost ? { totalCostMinor: cost.totalCostMinor, incomplete: cost.incomplete } : null,
      workOrderLineId: r.workOrderLineId,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  }
}

/** A slotRef produced by task sync (AMS `unit:slot`, external `254:0`, or `reported`). */
function isTaskSlotRef(slotRef: string): boolean {
  return slotRef === 'reported' || /^(\d+):(\d+)$/.test(slotRef);
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
