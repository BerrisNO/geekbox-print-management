import {
  type CostBreakdown,
  type CostRateSettings,
  type CostRatesInput,
  DEFAULT_CURRENCY_CODE,
} from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { EventBus } from '../../bus/event-bus.js';
import type { Db } from '../../db/client.js';
import { printer } from '../../db/schema/integration.js';
import { filamentProduct, spool } from '../../db/schema/inventory.js';
import {
  costCalculation,
  costRateSettings,
  filamentUsage,
  printerPowerDraw,
  printJob,
} from '../../db/schema/jobs.js';
import { newId, nowMs } from '../../shared/ids.js';
import { roundMinor, unitCostPerGramMinor } from '../../shared/money.js';

const SETTINGS_ID = 'singleton';

/** Costing (FR-403/404). Immutable snapshots; newest non-superseded is current. */
export class CostingService {
  constructor(
    private readonly db: Db,
    private readonly bus: EventBus,
  ) {}

  getRates(): CostRateSettings {
    let row = this.db
      .select()
      .from(costRateSettings)
      .where(eq(costRateSettings.id, SETTINGS_ID))
      .get();
    if (!row) {
      this.db
        .insert(costRateSettings)
        .values({
          id: SETTINGS_ID,
          energyPricePerKwhMinor: null,
          machineRatePerHourMinor: null,
          currencyCode: DEFAULT_CURRENCY_CODE,
        })
        .run();
      row = this.db
        .select()
        .from(costRateSettings)
        .where(eq(costRateSettings.id, SETTINGS_ID))
        .get()!;
    }
    const draws = this.db.select().from(printerPowerDraw).all();
    return {
      energyPricePerKwhMinor: row.energyPricePerKwhMinor,
      machineRatePerHourMinor: row.machineRatePerHourMinor,
      currencyCode: row.currencyCode,
      printerPowerDraw: draws.map((d) => {
        const p = this.db
          .select({ name: printer.name })
          .from(printer)
          .where(eq(printer.id, d.printerId))
          .get();
        return { printerId: d.printerId, printerName: p?.name ?? '', watts: d.watts };
      }),
    };
  }

  updateRates(input: CostRatesInput): CostRateSettings {
    this.getRates(); // ensure singleton exists
    this.db
      .update(costRateSettings)
      .set({
        ...(input.energyPricePerKwhMinor !== undefined
          ? { energyPricePerKwhMinor: input.energyPricePerKwhMinor }
          : {}),
        ...(input.machineRatePerHourMinor !== undefined
          ? { machineRatePerHourMinor: input.machineRatePerHourMinor }
          : {}),
        ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode } : {}),
      })
      .where(eq(costRateSettings.id, SETTINGS_ID))
      .run();
    if (input.printerPowerDraw) {
      for (const d of input.printerPowerDraw) {
        const existing = this.db
          .select()
          .from(printerPowerDraw)
          .where(eq(printerPowerDraw.printerId, d.printerId))
          .get();
        if (existing) {
          this.db
            .update(printerPowerDraw)
            .set({ watts: d.watts })
            .where(eq(printerPowerDraw.printerId, d.printerId))
            .run();
        } else {
          this.db.insert(printerPowerDraw).values({ printerId: d.printerId, watts: d.watts }).run();
        }
      }
    }
    return this.getRates();
  }

  /**
   * Compute and persist a new cost snapshot for a job (FR-404). Supersedes prior
   * snapshots. Freezes inputs (AC-404.2). Emits PrintJobCosted.
   */
  recalculate(jobId: string): CostBreakdown {
    const job = this.db.select().from(printJob).where(eq(printJob.id, jobId)).get();
    if (!job) throw new Error('Job not found');
    const rates = this.getRates();
    const usages = this.db.select().from(filamentUsage).where(eq(filamentUsage.jobId, jobId)).all();

    // Filament cost: sum over attributed usages of grams × spool unit cost.
    let filamentMinor = 0;
    let incomplete = false;
    const perSpool: CostBreakdown['inputs']['perSpool'] = [];
    for (const u of usages) {
      const grams = u.usedG ?? 0;
      if (u.spoolId == null || grams <= 0) {
        if (grams > 0) incomplete = true; // usage without a spool = unattributed cost
        continue;
      }
      const s = this.db.select().from(spool).where(eq(spool.id, u.spoolId)).get();
      if (!s) {
        incomplete = true;
        continue;
      }
      const prod = this.db
        .select()
        .from(filamentProduct)
        .where(eq(filamentProduct.id, s.productId))
        .get();
      const price = s.purchasePriceMinor ?? prod?.defaultPriceMinor ?? 0;
      const estimated = s.purchasePriceMinor == null;
      const unitCost = unitCostPerGramMinor(price, s.initialNetWeightG);
      filamentMinor += unitCost * grams;
      perSpool.push({ spoolId: s.id, grams, unitCostPerGMinor: unitCost, estimated });
    }

    // Energy + machine cost (null when rate not configured — AC-403.2).
    const durationMin = job.durationMin ?? null;
    const watts = job.printerId
      ? (this.db
          .select()
          .from(printerPowerDraw)
          .where(eq(printerPowerDraw.printerId, job.printerId))
          .get()?.watts ?? null)
      : null;
    let energyMinor: number | null = null;
    if (rates.energyPricePerKwhMinor != null && watts != null && durationMin != null) {
      const kwh = (watts / 1000) * (durationMin / 60);
      energyMinor = roundMinor(kwh * rates.energyPricePerKwhMinor);
    }
    let machineMinor: number | null = null;
    if (rates.machineRatePerHourMinor != null && durationMin != null) {
      machineMinor = roundMinor((durationMin / 60) * rates.machineRatePerHourMinor);
    }

    if (
      durationMin == null &&
      (rates.energyPricePerKwhMinor != null || rates.machineRatePerHourMinor != null)
    ) {
      incomplete = true; // can't compute time-based costs (ES-404.1)
    }

    const filamentCostMinor = roundMinor(filamentMinor);
    const totalCostMinor = filamentCostMinor + (energyMinor ?? 0) + (machineMinor ?? 0);

    const id = newId();
    const calculatedAt = nowMs();
    this.db.transaction(() => {
      // Supersede prior snapshots.
      this.db
        .update(costCalculation)
        .set({ superseded: 1 })
        .where(eq(costCalculation.jobId, jobId))
        .run();
      this.db
        .insert(costCalculation)
        .values({
          id,
          jobId,
          calculatedAt,
          filamentCostMinor,
          energyCostMinor: energyMinor,
          machineCostMinor: machineMinor,
          totalCostMinor,
          incomplete: incomplete ? 1 : 0,
          inputsSnapshotJson: JSON.stringify({
            perSpool,
            energyPricePerKwhMinor: rates.energyPricePerKwhMinor,
            machineRatePerHourMinor: rates.machineRatePerHourMinor,
            watts,
            durationMin,
          }),
          superseded: 0,
        })
        .run();
    });

    this.bus.publish({
      type: 'PrintJobCosted',
      jobId,
      costCalculationId: id,
      totalMinor: totalCostMinor,
      incomplete,
    });
    return this.currentCost(jobId)!;
  }

  currentCost(jobId: string): CostBreakdown | null {
    const rows = this.db
      .select()
      .from(costCalculation)
      .where(eq(costCalculation.jobId, jobId))
      .all();
    const current = rows
      .filter((r) => r.superseded === 0)
      .sort((a, b) => b.calculatedAt - a.calculatedAt)[0];
    if (!current) return null;
    const rates = this.getRates();
    return {
      id: current.id,
      jobId: current.jobId,
      calculatedAt: new Date(current.calculatedAt).toISOString(),
      filamentCostMinor: current.filamentCostMinor,
      energyCostMinor: current.energyCostMinor,
      machineCostMinor: current.machineCostMinor,
      totalCostMinor: current.totalCostMinor,
      incomplete: current.incomplete === 1,
      superseded: current.superseded === 1,
      currencyCode: rates.currencyCode,
      inputs: JSON.parse(current.inputsSnapshotJson),
    };
  }
}
