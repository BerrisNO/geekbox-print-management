import { eq } from 'drizzle-orm';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { filamentProduct, spool, spoolLedgerEntry, vendor } from '../../src/db/schema/inventory.js';
import { filamentUsage, printJob } from '../../src/db/schema/jobs.js';
import {
  balanceMatchesLastEntry,
  balancesFloorAtZero,
  filamentConserved,
  liveReversedInvariant,
} from '../../src/inventory/ledger/invariants.js';
import { LedgerWriter } from '../../src/inventory/ledger/ledger-write.js';
import { newId } from '../../src/shared/ids.js';
import { makeTestDb } from './_setup.js';

/**
 * Ledger correctness suite (ADR-009, RISK-005/007) — the #1 correctness target.
 * Property + explicit tests over the single write path. Runs where better-sqlite3
 * is available (CI node:22 / Docker).
 */

function seedSpool(db: Db, initialG: number): string {
  const vId = newId();
  const pId = newId();
  const sId = newId();
  db.insert(vendor).values({ id: vId, name: 'V', archived: 0 }).run();
  db.insert(filamentProduct)
    .values({
      id: pId,
      material: 'PLA',
      colorName: 'Black',
      vendorId: vId,
      diameterMm: 1.75,
      nominalNetWeightG: initialG,
      defaultPriceMinor: 25000,
      densityGCm3: 1.24,
      archived: 0,
    })
    .run();
  db.insert(spool)
    .values({
      id: sId,
      label: `S-${Math.floor(Math.random() * 1e6)}`,
      productId: pId,
      initialNetWeightG: initialG,
      remainingNetWeightG: 0,
      source: 'manual',
      status: 'in_stock',
      acquiredAt: 0,
    })
    .run();
  return sId;
}

function seedJobWithUsage(
  db: Db,
  slotRef: string,
  usedG: number,
): { jobId: string; usageId: string } {
  const jobId = newId();
  const usageId = newId();
  db.insert(printJob)
    .values({
      id: jobId,
      source: 'manual',
      jobName: 'J',
      outcome: 'success',
      usageStatus: 'manual',
      createdAt: 0,
      updatedAt: 0,
    })
    .run();
  db.insert(filamentUsage)
    .values({ id: usageId, jobId, slotRef, usedG, estimated: 0, attributed: 0 })
    .run();
  return { jobId, usageId };
}

describe('LedgerWriter', () => {
  let db: Db;
  let ledger: LedgerWriter;

  beforeEach(() => {
    db = makeTestDb();
    ledger = new LedgerWriter(db);
  });

  it('records the initial balance and denormalizes it onto the spool', () => {
    const sId = seedSpool(db, 1000);
    ledger.recordInitial({ spoolId: sId, initialWeightG: 1000 });
    const s = db.select().from(spool).where(eq(spool.id, sId)).get()!;
    expect(s.remainingNetWeightG).toBe(1000);
    expect(balanceMatchesLastEntry(db, sId)).toBe(true);
  });

  it('posts a consumption deduction exactly once (idempotent replay)', () => {
    const sId = seedSpool(db, 1000);
    ledger.recordInitial({ spoolId: sId, initialWeightG: 1000 });
    const { jobId, usageId } = seedJobWithUsage(db, '0:0', 250);

    const first = ledger.postConsumption({
      spoolId: sId,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 250,
      estimated: false,
    });
    expect(first.alreadyPosted).toBe(false);
    const second = ledger.postConsumption({
      spoolId: sId,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 250,
      estimated: false,
    });
    expect(second.alreadyPosted).toBe(true); // no double deduction
    expect(second.entryId).toBe(first.entryId);

    const s = db.select().from(spool).where(eq(spool.id, sId)).get()!;
    expect(s.remainingNetWeightG).toBe(750);
    const consumptions = db
      .select()
      .from(spoolLedgerEntry)
      .where(eq(spoolLedgerEntry.type, 'consumption'))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(liveReversedInvariant(db)).toBe(true);
  });

  it('floors at zero and marks over-consumption + depletion', () => {
    const sId = seedSpool(db, 100);
    ledger.recordInitial({ spoolId: sId, initialWeightG: 100 });
    const { jobId, usageId } = seedJobWithUsage(db, '0:0', 250);
    ledger.postConsumption({
      spoolId: sId,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 250,
      estimated: false,
    });
    const s = db.select().from(spool).where(eq(spool.id, sId)).get()!;
    expect(s.remainingNetWeightG).toBe(0);
    expect(s.status).toBe('depleted');
    const entry = db
      .select()
      .from(spoolLedgerEntry)
      .where(eq(spoolLedgerEntry.type, 'consumption'))
      .get()!;
    expect(entry.overConsumption).toBe(1);
    expect(balancesFloorAtZero(db)).toBe(true);
  });

  it('reverse-and-repost correction repoints the usage to the new live entry (ADR-009 §1)', () => {
    const sId1 = seedSpool(db, 1000);
    const sId2 = seedSpool(db, 1000);
    ledger.recordInitial({ spoolId: sId1, initialWeightG: 1000 });
    ledger.recordInitial({ spoolId: sId2, initialWeightG: 1000 });
    const { jobId, usageId } = seedJobWithUsage(db, '0:0', 300);
    ledger.postConsumption({
      spoolId: sId1,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 300,
      estimated: false,
    });

    // Correct: move the usage to spool 2 with 200g.
    ledger.correctConsumption({
      usageId,
      newSpoolId: sId2,
      newGrams: 200,
      jobId,
      slotRef: '0:0',
      estimated: false,
    });

    const s1 = db.select().from(spool).where(eq(spool.id, sId1)).get()!;
    const s2 = db.select().from(spool).where(eq(spool.id, sId2)).get()!;
    expect(s1.remainingNetWeightG).toBe(1000); // reversed back
    expect(s2.remainingNetWeightG).toBe(800); // new 200g deduction
    const usage = db.select().from(filamentUsage).where(eq(filamentUsage.id, usageId)).get()!;
    const live = db
      .select()
      .from(spoolLedgerEntry)
      .where(eq(spoolLedgerEntry.id, usage.ledgerEntryId!))
      .get()!;
    expect(live.spoolId).toBe(sId2);
    expect(live.deltaG).toBe(-200);
    // Invariant: exactly one non-live consumption reversed once; live entry not reversed.
    expect(liveReversedInvariant(db)).toBe(true);
  });

  it('same-spool amount correction does not violate any constraint (M1 resolution)', () => {
    const sId = seedSpool(db, 1000);
    ledger.recordInitial({ spoolId: sId, initialWeightG: 1000 });
    const { jobId, usageId } = seedJobWithUsage(db, '0:0', 42.5);
    ledger.postConsumption({
      spoolId: sId,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 42.5,
      estimated: false,
    });
    // 42.5 -> 40 on the SAME spool (the case the removed v1 constraint would have blocked).
    expect(() =>
      ledger.correctConsumption({
        usageId,
        newSpoolId: sId,
        newGrams: 40,
        jobId,
        slotRef: '0:0',
        estimated: false,
      }),
    ).not.toThrow();
    const s = db.select().from(spool).where(eq(spool.id, sId)).get()!;
    expect(s.remainingNetWeightG).toBeCloseTo(960, 5); // 1000 - 42.5 + 42.5 - 40
    expect(liveReversedInvariant(db)).toBe(true);
  });

  it('reversing an over-consumption restores the exact pre-consumption balance (BUG-001/MR-004)', () => {
    // Regression for the phantom-filament defect: over-consume a spool past zero
    // (floored to 0, over_consumption flag set), then reverse the correction. The
    // book-of-record must return to the EXACT pre-consumption balance — no grams
    // that were never physically present may be added back (ADR-009 conservation).
    const sId = seedSpool(db, 100);
    ledger.recordInitial({ spoolId: sId, initialWeightG: 100 });
    const { jobId, usageId } = seedJobWithUsage(db, '0:0', 250);
    // Over-consume: 250g against a 100g spool -> floors to 0, over_consumption=1.
    ledger.postConsumption({
      spoolId: sId,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 250,
      estimated: false,
    });
    const afterConsume = db.select().from(spool).where(eq(spool.id, sId)).get()!;
    expect(afterConsume.remainingNetWeightG).toBe(0);

    // Correct the usage down to 0g on the SAME spool (pure reversal of the over-consumption).
    ledger.correctConsumption({
      usageId,
      newSpoolId: sId,
      newGrams: 0,
      jobId,
      slotRef: '0:0',
      estimated: false,
    });

    const afterReverse = db.select().from(spool).where(eq(spool.id, sId)).get()!;
    // Pre-consumption balance was 100. The reversal must NOT inflate it above 100.
    // Buggy behavior added back the nominal 250g (-(-250)=+250) -> phantom 100g.
    expect(afterReverse.remainingNetWeightG).toBe(100);
    expect(filamentConserved(db, sId)).toBe(true);
    expect(liveReversedInvariant(db)).toBe(true);
  });

  it('reversing a partial over-consumption conserves exactly (mixed floor/no-floor)', () => {
    // 60g consumed on a 100g spool (no floor) then corrected to 130g (floors to 0),
    // then reversed to 0g. Net must return to 100g, never above.
    const sId = seedSpool(db, 100);
    ledger.recordInitial({ spoolId: sId, initialWeightG: 100 });
    const { jobId, usageId } = seedJobWithUsage(db, '0:0', 60);
    ledger.postConsumption({
      spoolId: sId,
      jobId,
      slotRef: '0:0',
      usageId,
      grams: 60,
      estimated: false,
    });
    expect(db.select().from(spool).where(eq(spool.id, sId)).get()!.remainingNetWeightG).toBe(40);
    // Correct up to 130g -> floors to 0 (over-consumption of the corrected entry).
    ledger.correctConsumption({
      usageId,
      newSpoolId: sId,
      newGrams: 130,
      jobId,
      slotRef: '0:0',
      estimated: false,
    });
    expect(db.select().from(spool).where(eq(spool.id, sId)).get()!.remainingNetWeightG).toBe(0);
    // Correct back down to 0g -> spool must return to exactly 100.
    ledger.correctConsumption({
      usageId,
      newSpoolId: sId,
      newGrams: 0,
      jobId,
      slotRef: '0:0',
      estimated: false,
    });
    expect(db.select().from(spool).where(eq(spool.id, sId)).get()!.remainingNetWeightG).toBe(100);
    expect(filamentConserved(db, sId)).toBe(true);
  });

  it('property: reverse-after-floor never inflates the spool balance (conservation)', () => {
    // For any initial weight and any over-consuming deduction, reversing the
    // correction to 0g returns the balance to <= the pre-consumption value.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 3000 }),
        (initialG, consumeG) => {
          const freshDb = makeTestDb();
          const w = new LedgerWriter(freshDb);
          const sId = seedSpool(freshDb, initialG);
          w.recordInitial({ spoolId: sId, initialWeightG: initialG });
          const { jobId, usageId } = seedJobWithUsage(freshDb, '0:0', consumeG);
          w.postConsumption({
            spoolId: sId,
            jobId,
            slotRef: '0:0',
            usageId,
            grams: consumeG,
            estimated: false,
          });
          w.correctConsumption({
            usageId,
            newSpoolId: sId,
            newGrams: 0,
            jobId,
            slotRef: '0:0',
            estimated: false,
          });
          const s = freshDb.select().from(spool).where(eq(spool.id, sId)).get()!;
          return (
            s.remainingNetWeightG === initialG &&
            filamentConserved(freshDb, sId) &&
            balancesFloorAtZero(freshDb)
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it('property: after any sequence of deductions, balance == last entry and never < 0', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 300 }), { minLength: 1, maxLength: 15 }),
        (deductions) => {
          const freshDb = makeTestDb();
          const w = new LedgerWriter(freshDb);
          const sId = seedSpool(freshDb, 1000);
          w.recordInitial({ spoolId: sId, initialWeightG: 1000 });
          deductions.forEach((g, i) => {
            const { jobId, usageId } = seedJobWithUsage(freshDb, `0:${i}`, g);
            w.postConsumption({
              spoolId: sId,
              jobId,
              slotRef: `0:${i}`,
              usageId,
              grams: g,
              estimated: false,
            });
          });
          return (
            balanceMatchesLastEntry(freshDb, sId) &&
            balancesFloorAtZero(freshDb) &&
            liveReversedInvariant(freshDb)
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});
