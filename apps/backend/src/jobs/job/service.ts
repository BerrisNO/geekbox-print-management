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
import { and, eq, gte, lte } from 'drizzle-orm';
import type { EventBus } from '../../bus/event-bus.js';
import type { Db } from '../../db/client.js';
import { printer } from '../../db/schema/integration.js';
import { spool, spoolLedgerEntry } from '../../db/schema/inventory.js';
import { filamentUsage, printJob } from '../../db/schema/jobs.js';
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
   */
  upsertFromTask(task: {
    bambuTaskId: string;
    printerSerial?: string;
    jobName?: string;
    startedAt?: number;
    endedAt?: number;
    durationMin?: number;
    outcome?: JobOutcome;
  }): { jobId: string; created: boolean } {
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
          updatedAt: nowMs(),
        })
        .where(eq(printJob.id, existing.id))
        .run();
      return { jobId: existing.id, created: false };
    }

    // Try to adopt a recent telemetry-only job in the ±10min window.
    if (printerId && task.startedAt) {
      const windowMs = 10 * 60 * 1000;
      const candidate = this.db
        .select()
        .from(printJob)
        .where(
          and(
            eq(printJob.printerId, printerId),
            eq(printJob.source, 'telemetry'),
            gte(printJob.startedAt, task.startedAt - windowMs),
            lte(printJob.startedAt, task.startedAt + windowMs),
          ),
        )
        .get();
      if (candidate && candidate.bambuTaskId == null) {
        this.db
          .update(printJob)
          .set({
            bambuTaskId: task.bambuTaskId,
            jobName: task.jobName ?? candidate.jobName,
            outcome: task.outcome ?? candidate.outcome,
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
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { jobId: id, created: true };
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
        return {
          id: u.id,
          jobId: u.jobId,
          slotRef: u.slotRef,
          spoolId: u.spoolId,
          spoolLabel: label,
          usedG: u.usedG,
          usedMm: u.usedMm,
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
      cost: cost ? { totalCostMinor: cost.totalCostMinor, incomplete: cost.incomplete } : null,
      workOrderLineId: r.workOrderLineId,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  }
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
