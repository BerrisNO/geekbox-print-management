import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { spool, spoolLedgerEntry } from '../../db/schema/inventory.js';
import { filamentUsage } from '../../db/schema/jobs.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';

/**
 * THE single ledger write path (ADR-009). This module is the ONLY writer of
 * spool_ledger_entry and the ONLY code that mutates spool.remaining_net_weight_g.
 * Every deduction source (auto attribution, later assignment, manual job,
 * correction) funnels through here. Enforced by dependency-cruiser (NFR-MA-02).
 *
 * All public methods run inside a caller-provided transaction where noted; the
 * standalone methods open their own transaction. Atomicity guarantees:
 *  - entry insert + balance update + optional status transition = one tx (ES-103.1)
 *  - floor-at-zero with over_consumption flag (AC-103.3)
 *  - exactly-once via the three DB constraints (ADR-009 §3)
 *  - reverse-and-repost corrections repoint filament_usage.ledger_entry_id (§1)
 */

export type PostConsumptionArgs = {
  spoolId: string;
  jobId: string;
  slotRef: string;
  usageId: string;
  grams: number;
  estimated: boolean;
  note?: string;
};

export type ManualAdjustArgs = {
  spoolId: string;
  /** New absolute net weight to set (recalibration, FR-104). */
  newNetWeightG: number;
  note?: string;
};

export type InitialArgs = {
  spoolId: string;
  initialWeightG: number;
  note?: string;
};

export class LedgerWriter {
  constructor(private readonly db: Db) {}

  /** Read the spool row or throw. */
  private getSpool(spoolId: string): typeof spool.$inferSelect {
    const row = this.db.select().from(spool).where(eq(spool.id, spoolId)).get();
    if (!row) throw new NotFoundError('Spool');
    return row;
  }

  /**
   * Insert an entry and update the denormalized balance atomically. Applies
   * floor-at-zero. Transitions spool to depleted when the balance reaches 0
   * on a consumption/adjustment. Returns the created entry id, new balance, the
   * over-consumption flag, and the *effective applied delta* (the post-floor
   * change to the balance — `balanceAfterG - previousBalance`).
   *
   * The effective applied delta is the conservation-correct amount by which the
   * book-of-record moved: it equals `deltaG` unless the entry over-consumed, in
   * which case only the available filament was actually deducted. Reversals MUST
   * negate this effective delta, NOT the nominal `deltaG` (BUG-001/MR-004): the
   * nominal delta of a floored over-consumption includes phantom grams that were
   * never physically present, and adding them back inflates the ledger.
   *
   * MUST be called inside a transaction (either the caller's or a wrapper).
   */
  private applyEntry(args: {
    spoolId: string;
    type: 'initial' | 'consumption' | 'manual_adjustment' | 'reversal';
    deltaG: number;
    jobId?: string | null;
    slotRef?: string | null;
    reversesEntryId?: string | null;
    estimated?: boolean;
    note?: string | null;
  }): { entryId: string; balanceAfterG: number; overConsumption: boolean; appliedDeltaG: number } {
    const current = this.getSpool(args.spoolId);
    const previousBalance = current.remainingNetWeightG;
    const rawBalance = previousBalance + args.deltaG;
    const overConsumption = rawBalance < 0;
    const balanceAfterG = overConsumption ? 0 : rawBalance;
    // Effective (post-floor) change to the book-of-record. This is what a reversal
    // of this entry must negate to conserve filament exactly.
    const appliedDeltaG = balanceAfterG - previousBalance;
    const entryId = newId();
    const ts = nowMs();

    this.db
      .insert(spoolLedgerEntry)
      .values({
        id: entryId,
        spoolId: args.spoolId,
        type: args.type,
        deltaG: args.deltaG,
        appliedDeltaG,
        balanceAfterG,
        jobId: args.jobId ?? null,
        slotRef: args.slotRef ?? null,
        reversesEntryId: args.reversesEntryId ?? null,
        estimated: args.estimated ? 1 : 0,
        overConsumption: overConsumption ? 1 : 0,
        note: args.note ?? null,
        createdAt: ts,
      })
      .run();

    // Determine status transition: deplete at zero; a positive adjustment on a
    // depleted spool returns it to in_stock (unless it is mapped — that stays in_use).
    const nextStatus =
      balanceAfterG <= 0 ? 'depleted' : current.status === 'depleted' ? 'in_stock' : current.status;

    this.db
      .update(spool)
      .set({ remainingNetWeightG: balanceAfterG, status: nextStatus })
      .where(eq(spool.id, args.spoolId))
      .run();

    return { entryId, balanceAfterG, overConsumption, appliedDeltaG };
  }

  /** Record the opening balance for a freshly created spool. */
  recordInitial(args: InitialArgs): string {
    return this.db.transaction(() => {
      const { entryId } = this.applyEntry({
        spoolId: args.spoolId,
        type: 'initial',
        deltaG: args.initialWeightG,
        note: args.note ?? null,
      });
      return entryId;
    });
  }

  /** Variant of recordInitial that runs inside an existing transaction (reception path). */
  recordInitialInTx(args: InitialArgs): string {
    return this.applyEntry({
      spoolId: args.spoolId,
      type: 'initial',
      deltaG: args.initialWeightG,
      note: args.note ?? null,
    }).entryId;
  }

  /**
   * Post a consumption deduction for an unattributed/newly-attributed usage.
   * Idempotent: if the usage already references a live ledger entry, this is a
   * no-op returning the existing entry id (survives re-syncs — RISK-007).
   * Runs in its own transaction.
   */
  postConsumption(args: PostConsumptionArgs): { entryId: string; alreadyPosted: boolean } {
    return this.db.transaction(() => {
      const usage = this.db
        .select()
        .from(filamentUsage)
        .where(eq(filamentUsage.id, args.usageId))
        .get();
      if (!usage) throw new NotFoundError('Usage');
      if (usage.ledgerEntryId) {
        // Already posted (constraint b) — idempotent no-op.
        return { entryId: usage.ledgerEntryId, alreadyPosted: true };
      }

      const { entryId } = this.applyEntry({
        spoolId: args.spoolId,
        type: 'consumption',
        deltaG: -Math.abs(args.grams),
        jobId: args.jobId,
        slotRef: args.slotRef,
        estimated: args.estimated,
        note: args.note ?? null,
      });

      this.db
        .update(filamentUsage)
        .set({ ledgerEntryId: entryId, spoolId: args.spoolId, attributed: 1 })
        .where(eq(filamentUsage.id, args.usageId))
        .run();

      return { entryId, alreadyPosted: false };
    });
  }

  /**
   * Reverse-and-repost correction (FR-405 AC-405.2, ADR-009 §1). One transaction:
   *  (a) insert reversal of the CURRENT LIVE entry (referenced by the usage);
   *  (b) insert corrected consumption entry (same or different spool allowed);
   *  (c) repoint filament_usage.ledger_entry_id to the new entry;
   *  (d) balances updated inside applyEntry.
   * If the usage has no live entry yet, this behaves like a fresh postConsumption.
   */
  correctConsumption(args: {
    usageId: string;
    newSpoolId: string;
    newGrams: number;
    jobId: string;
    slotRef: string;
    estimated: boolean;
    note?: string;
  }): { entryId: string } {
    return this.db.transaction(() => {
      const usage = this.db
        .select()
        .from(filamentUsage)
        .where(eq(filamentUsage.id, args.usageId))
        .get();
      if (!usage) throw new NotFoundError('Usage');

      // Reverse the current live entry, if any.
      if (usage.ledgerEntryId) {
        const live = this.db
          .select()
          .from(spoolLedgerEntry)
          .where(eq(spoolLedgerEntry.id, usage.ledgerEntryId))
          .get();
        if (!live) throw new NotFoundError('Live ledger entry');
        // Constraint (c) guards double-reversal at the DB level; surface a clean error.
        const alreadyReversed = this.db
          .select({ id: spoolLedgerEntry.id })
          .from(spoolLedgerEntry)
          .where(eq(spoolLedgerEntry.reversesEntryId, live.id))
          .get();
        if (alreadyReversed) {
          throw new ConflictError('LEDGER_ALREADY_REVERSED', 'Entry already reversed');
        }
        // Reverse the *effective applied* delta, not the nominal delta. If the
        // live entry over-consumed (floored at zero), its nominal delta_g includes
        // phantom grams that were never physically deducted; reversing the nominal
        // delta would inflate the book-of-record with filament that never existed
        // (BUG-001/MR-004). appliedDeltaG is the post-floor change and conserves
        // filament exactly.
        const reversalDelta = -live.appliedDeltaG;
        this.applyEntry({
          spoolId: live.spoolId,
          type: 'reversal',
          deltaG: reversalDelta,
          jobId: live.jobId,
          slotRef: live.slotRef,
          reversesEntryId: live.id,
          note: `Reversal for correction of ${live.id}`,
        });
      }

      // Repost the corrected consumption.
      const { entryId } = this.applyEntry({
        spoolId: args.newSpoolId,
        type: 'consumption',
        deltaG: -Math.abs(args.newGrams),
        jobId: args.jobId,
        slotRef: args.slotRef,
        estimated: args.estimated,
        note: args.note ?? null,
      });

      this.db
        .update(filamentUsage)
        .set({
          ledgerEntryId: entryId,
          spoolId: args.newSpoolId,
          attributed: 1,
          usedG: Math.abs(args.newGrams),
        })
        .where(eq(filamentUsage.id, args.usageId))
        .run();

      return { entryId };
    });
  }

  /**
   * Manual weight recalibration (FR-104). Inserts a manual_adjustment entry whose
   * delta brings the balance to newNetWeightG. Runs in its own transaction.
   */
  manualAdjust(args: ManualAdjustArgs): { entryId: string; balanceAfterG: number } {
    return this.db.transaction(() => {
      const current = this.getSpool(args.spoolId);
      const delta = args.newNetWeightG - current.remainingNetWeightG;
      const { entryId, balanceAfterG } = this.applyEntry({
        spoolId: args.spoolId,
        type: 'manual_adjustment',
        deltaG: delta,
        note: args.note ?? null,
      });
      return { entryId, balanceAfterG };
    });
  }
}
