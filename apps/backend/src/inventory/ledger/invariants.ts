import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { spool, spoolLedgerEntry } from '../../db/schema/inventory.js';
import { filamentUsage } from '../../db/schema/jobs.js';

/**
 * Exported invariant predicates for the property-test suite (NFR-MA-01).
 * These assert the ADR-009 correctness guarantees over the live DB state.
 */

/** Invariant 1: spool.remaining_net_weight_g == balance_after_g of newest entry. */
export function balanceMatchesLastEntry(db: Db, spoolId: string): boolean {
  const s = db.select().from(spool).where(eq(spool.id, spoolId)).get();
  if (!s) return false;
  const entries = db
    .select()
    .from(spoolLedgerEntry)
    .where(eq(spoolLedgerEntry.spoolId, spoolId))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt);
  if (entries.length === 0) return s.remainingNetWeightG === 0;
  const last = entries[entries.length - 1]!;
  return Math.abs(last.balanceAfterG - s.remainingNetWeightG) < 1e-6;
}

/** Invariant 2: balances never go below zero. */
export function balancesFloorAtZero(db: Db): boolean {
  const entries = db.select().from(spoolLedgerEntry).all();
  return entries.every((e) => e.balanceAfterG >= 0);
}

/**
 * Invariant 4 (ADR-009 conservation — BUG-001/MR-004 guard): filament is neither
 * created nor destroyed by the ledger. For a single spool, the current balance
 * must equal the initial balance plus the sum of every entry's *effective applied
 * delta* (the post-floor change to the balance), and each reversal must exactly
 * negate the effective applied delta of the entry it reverses.
 *
 * The effective applied delta of an entry is `balance_after_g - previous_balance`,
 * which — unlike the nominal `delta_g` — accounts for floor-at-zero. Reversing the
 * nominal delta of a floored over-consumption would add back grams that were never
 * physically deducted (phantom filament); this invariant catches exactly that.
 */
export function filamentConserved(db: Db, spoolId: string): boolean {
  const entries = db
    .select()
    .from(spoolLedgerEntry)
    .where(eq(spoolLedgerEntry.spoolId, spoolId))
    .all();
  if (entries.length === 0) return true;

  const byId = new Map(entries.map((e) => [e.id, e]));

  // 1. The current spool balance must equal the sum of every entry's *effective
  //    applied delta* (the persisted post-floor change). This is the core
  //    conservation identity: the book-of-record moved by exactly the sum of the
  //    real deductions/additions, with no phantom grams.
  const s = db.select().from(spool).where(eq(spool.id, spoolId)).get();
  if (!s) return false;
  const sumApplied = entries.reduce((acc, e) => acc + e.appliedDeltaG, 0);
  if (Math.abs(sumApplied - s.remainingNetWeightG) < 1e-6 === false) return false;

  // 2. Every reversal must negate the applied delta of the entry it reverses, so a
  //    reversed pair on this spool contributes exactly zero net filament change.
  for (const e of entries) {
    if (e.type === 'reversal' && e.reversesEntryId) {
      const target = byId.get(e.reversesEntryId);
      // Target may live on a different spool (cross-spool correction); only assert
      // the pair-net when both are on this spool so it is checkable here.
      if (target && target.spoolId === spoolId) {
        if (Math.abs(e.appliedDeltaG + target.appliedDeltaG) > 1e-6) return false;
      }
    }
  }
  return true;
}

/**
 * Invariant 3 (ADR-009 live/reversed): a consumption entry with a job_id is live
 * iff referenced by some filament_usage.ledger_entry_id; every non-live
 * consumption entry is reversed exactly once.
 */
export function liveReversedInvariant(db: Db): boolean {
  const consumptions = db
    .select()
    .from(spoolLedgerEntry)
    .where(eq(spoolLedgerEntry.type, 'consumption'))
    .all()
    .filter((e) => e.jobId !== null);

  const usages = db.select().from(filamentUsage).all();
  const referenced = new Set(usages.map((u) => u.ledgerEntryId).filter((x): x is string => !!x));

  const reversals = db
    .select()
    .from(spoolLedgerEntry)
    .where(eq(spoolLedgerEntry.type, 'reversal'))
    .all();
  const reversalCounts = new Map<string, number>();
  for (const r of reversals) {
    if (r.reversesEntryId) {
      reversalCounts.set(r.reversesEntryId, (reversalCounts.get(r.reversesEntryId) ?? 0) + 1);
    }
  }

  for (const c of consumptions) {
    const isLive = referenced.has(c.id);
    const reversedTimes = reversalCounts.get(c.id) ?? 0;
    if (isLive) {
      // Live entries must not be reversed.
      if (reversedTimes !== 0) return false;
    } else {
      // Non-live consumption entries must be reversed exactly once.
      if (reversedTimes !== 1) return false;
    }
  }
  return true;
}
