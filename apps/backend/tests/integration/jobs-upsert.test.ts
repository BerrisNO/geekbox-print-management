import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/bus/event-bus.js';
import type { Db } from '../../src/db/client.js';
import { printer } from '../../src/db/schema/integration.js';
import { spool as spoolTable } from '../../src/db/schema/inventory.js';
import { filamentUsage, printJob } from '../../src/db/schema/jobs.js';
import type { TaskRecord } from '../../src/integration/ports.js';
import { AmsMappingService } from '../../src/inventory/ams-mapping/service.js';
import { CatalogService } from '../../src/inventory/catalog/service.js';
import { LedgerWriter } from '../../src/inventory/ledger/ledger-write.js';
import { SpoolService } from '../../src/inventory/spool/service.js';
import { CostingService } from '../../src/jobs/costing/service.js';
import { JobService } from '../../src/jobs/job/service.js';
import { makeTestDb } from './_setup.js';

/**
 * upsertFromTask: cover + per-slot filament capture, idempotent backfill, and
 * auto-attribution when the slot mapping predates the job start.
 */
describe('JobService.upsertFromTask — cover + filament usages', () => {
  let db: Db;
  let jobs: JobService;
  let spools: SpoolService;
  let catalog: CatalogService;
  let ams: AmsMappingService;

  beforeEach(() => {
    db = makeTestDb();
    const bus = new EventBus();
    const ledger = new LedgerWriter(db);
    catalog = new CatalogService(db);
    spools = new SpoolService(db, ledger);
    ams = new AmsMappingService(db);
    const costing = new CostingService(db, bus);
    jobs = new JobService(db, ledger, costing, ams, bus);
  });

  function makeSpool() {
    const vendor = catalog.createVendor({ name: 'Acme' });
    const product = catalog.createProduct({
      material: 'PLA',
      spoolType: 'plastic',
      colorName: 'Red',
      vendorId: vendor.id,
      diameterMm: 1.75,
      nominalNetWeightG: 1000,
    });
    return spools.register({ productId: product.id, initialNetWeightG: 1000 });
  }

  function baseTask(): TaskRecord {
    return {
      bambuTaskId: '900000001',
      jobName: 'Benchy',
      outcome: 'success',
      coverUrl: 'https://public.bambulab.com/covers/900000001.png',
      totalWeightG: 24.5,
      usages: [
        { slotRef: '0:1', filamentType: 'PLA', colorHex: '#FF0000', weightG: 20 },
        { slotRef: '254:0', filamentType: 'PETG', colorHex: '#00FF00', weightG: 4.5 },
      ],
    };
  }

  it('creates a job with cover + unattributed usage rows (no ledger posting)', () => {
    const { jobId, created } = jobs.upsertFromTask(baseTask());
    expect(created).toBe(true);

    const job = db.select().from(printJob).where(eq(printJob.id, jobId)).get()!;
    expect(job.coverUrl).toBe('https://public.bambulab.com/covers/900000001.png');
    expect(job.coverCached).toBe(0); // not downloaded yet
    expect(job.totalWeightG).toBe(24.5);

    const usages = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();
    expect(usages).toHaveLength(2);
    const bySlot = new Map(usages.map((u) => [u.slotRef, u]));
    expect(bySlot.get('0:1')).toMatchObject({ usedG: 20, trayType: 'PLA', colorHex: '#FF0000' });
    // Suggest-and-confirm: nothing attributed, no ledger entry posted.
    for (const u of usages) {
      expect(u.attributed).toBe(0);
      expect(u.ledgerEntryId).toBeNull();
    }
  });

  it('backfills unattributed rows on re-sync but preserves an attributed row', () => {
    const { jobId } = jobs.upsertFromTask(baseTask());
    const usages = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();
    const pla = usages.find((u) => u.slotRef === '0:1')!;

    // Confirm attribution of the 0:1 usage to a real spool (posts the ledger).
    const spool = makeSpool();
    jobs.attribute(jobId, pla.id, spool.id);
    const attributed = db.select().from(filamentUsage).where(eq(filamentUsage.id, pla.id)).get()!;
    expect(attributed.ledgerEntryId).not.toBeNull();

    // Re-sync: same task, changed 0:1 weight, 254:0 dropped, new 0:2 added.
    jobs.upsertFromTask({
      ...baseTask(),
      usages: [
        { slotRef: '0:1', filamentType: 'PLA', colorHex: '#FF0000', weightG: 99 },
        { slotRef: '0:2', filamentType: 'PLA', colorHex: '#0000FF', weightG: 3 },
      ],
    });

    const after = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();
    const afterBySlot = new Map(after.map((u) => [u.slotRef, u]));
    // Attributed row is untouched (grams NOT overwritten to 99; ledger link intact).
    expect(afterBySlot.get('0:1')).toMatchObject({
      usedG: 20,
      ledgerEntryId: attributed.ledgerEntryId,
    });
    // Stale unattributed slot removed; freshly reported slot added.
    expect(afterBySlot.has('254:0')).toBe(false);
    expect(afterBySlot.get('0:2')).toMatchObject({ usedG: 3, colorHex: '#0000FF' });
  });

  it('replaces the "reported" fallback once per-slot detail arrives', () => {
    // First sync: only a total weight, no per-slot detail → single fallback usage.
    const { jobId } = jobs.upsertFromTask({
      bambuTaskId: '900000002',
      jobName: 'Bracket',
      outcome: 'success',
      totalWeightG: 12,
      usages: [{ slotRef: 'reported', weightG: 12 }],
    });
    let usages = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();
    expect(usages.map((u) => u.slotRef)).toEqual(['reported']);

    // Re-sync with real per-slot detail → fallback removed, real slot present.
    jobs.upsertFromTask({
      bambuTaskId: '900000002',
      jobName: 'Bracket',
      outcome: 'success',
      totalWeightG: 12,
      usages: [{ slotRef: '0:0', filamentType: 'PLA', weightG: 12 }],
    });
    usages = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();
    expect(usages.map((u) => u.slotRef)).toEqual(['0:0']);
  });

  it('auto-attributes only jobs that started after the slot mapping existed', () => {
    db.insert(printer)
      .values({ id: 'prn1', serial: 'SER1', name: 'X1C', registration: 'manual' })
      .run();
    const spool = makeSpool();
    ams.mapSlot('prn1', '0:1', spool.id);
    const now = Date.now();

    // New job (started after mapping) → deduction posted automatically.
    const { jobId } = jobs.upsertFromTask({
      bambuTaskId: 'T-auto',
      printerSerial: 'SER1',
      jobName: 'auto',
      outcome: 'success',
      startedAt: now + 60_000,
      usages: [{ slotRef: '0:1', filamentType: 'PLA', weightG: 50 }],
    });
    const auto = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).get()!;
    expect(auto.spoolId).toBe(spool.id);
    expect(auto.ledgerEntryId).not.toBeNull();
    expect(
      db.select().from(spoolTable).where(eq(spoolTable.id, spool.id)).get()!.remainingNetWeightG,
    ).toBe(950);

    // Historic job (started before mapping) → left unattributed with no deduction.
    const { jobId: oldJobId } = jobs.upsertFromTask({
      bambuTaskId: 'T-old',
      printerSerial: 'SER1',
      jobName: 'old',
      outcome: 'success',
      startedAt: now - 24 * 60 * 60 * 1000,
      usages: [{ slotRef: '0:1', filamentType: 'PLA', weightG: 30 }],
    });
    const old = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, oldJobId)).get()!;
    expect(old.ledgerEntryId).toBeNull();

    // "reported" fallback resolves to the printer's sole mapping and auto-posts too.
    const { jobId: repJobId } = jobs.upsertFromTask({
      bambuTaskId: 'T-rep',
      printerSerial: 'SER1',
      jobName: 'rep',
      outcome: 'success',
      startedAt: now + 120_000,
      usages: [{ slotRef: 'reported', weightG: 10 }],
    });
    const rep = db.select().from(filamentUsage).where(eq(filamentUsage.jobId, repJobId)).get()!;
    expect(rep.spoolId).toBe(spool.id);
    expect(rep.ledgerEntryId).not.toBeNull();
  });
});
