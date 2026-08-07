import {
  computePartEconomics,
  type Material,
  type Part,
  type PartInput,
  type PartMaterialLine,
  type PartMaterialWithPrice,
} from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { customer, filamentProduct, part, partMaterial } from '../db/schema/inventory.js';
import type { CostingService } from '../jobs/costing/service.js';
import { NotFoundError } from '../shared/errors/index.js';
import { newId } from '../shared/ids.js';

/**
 * Part CRUD + BOM sync + server-side economics. The BOM rows are reconciled by
 * delete+reinsert on create/update (mirrors CatalogService.syncProductVendors).
 * Economics are computed from the cost settings and the joined filament prices.
 */
export class PartService {
  constructor(
    private readonly db: Db,
    private readonly costing: CostingService,
  ) {}

  list(includeArchived = false): Part[] {
    const rows = this.db.select().from(part).all();
    return rows.filter((r) => includeArchived || r.archived === 0).map((r) => this.toPart(r));
  }

  get(id: string): Part {
    const row = this.db.select().from(part).where(eq(part.id, id)).get();
    if (!row) throw new NotFoundError('Part');
    return this.toPart(row);
  }

  create(input: PartInput): Part {
    const id = newId();
    this.assertCustomer(input.customerId);
    this.db
      .insert(part)
      .values({
        id,
        articleNo: input.articleNo,
        name: input.name,
        customerId: input.customerId ?? null,
        customerArticleNo: input.customerArticleNo ?? null,
        printTimeMin: input.printTimeMin ?? null,
        laborTimeMin: input.laborTimeMin ?? null,
        powerDrawW: input.powerDrawW ?? null,
        markupPct: input.markupPct ?? null,
        sellPriceMinor: input.sellPriceMinor ?? null,
        notes: input.notes ?? null,
        archived: 0,
      })
      .run();
    this.syncMaterials(id, input.materials);
    return this.get(id);
  }

  update(id: string, input: Partial<PartInput>): Part {
    this.get(id);
    this.assertCustomer(input.customerId);
    this.db
      .update(part)
      .set({
        ...(input.articleNo !== undefined ? { articleNo: input.articleNo } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId ?? null } : {}),
        ...(input.customerArticleNo !== undefined
          ? { customerArticleNo: input.customerArticleNo ?? null }
          : {}),
        ...(input.printTimeMin !== undefined ? { printTimeMin: input.printTimeMin ?? null } : {}),
        ...(input.laborTimeMin !== undefined ? { laborTimeMin: input.laborTimeMin ?? null } : {}),
        ...(input.powerDrawW !== undefined ? { powerDrawW: input.powerDrawW ?? null } : {}),
        ...(input.markupPct !== undefined ? { markupPct: input.markupPct ?? null } : {}),
        ...(input.sellPriceMinor !== undefined
          ? { sellPriceMinor: input.sellPriceMinor ?? null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      })
      .where(eq(part.id, id))
      .run();
    if (input.materials !== undefined) this.syncMaterials(id, input.materials);
    return this.get(id);
  }

  archive(id: string): Part {
    this.get(id);
    this.db.update(part).set({ archived: 1 }).where(eq(part.id, id)).run();
    return this.get(id);
  }

  private assertCustomer(customerId: string | undefined): void {
    if (!customerId) return;
    const row = this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.id, customerId))
      .get();
    if (!row) throw new NotFoundError('Customer');
  }

  /** Reconcile part_material rows to match the input BOM (delete + reinsert). */
  private syncMaterials(
    partId: string,
    materials: { filamentProductId: string; grams: number }[],
  ): void {
    this.db.delete(partMaterial).where(eq(partMaterial.partId, partId)).run();
    // Dedupe by filamentProductId (composite PK); last write wins.
    const byFilament = new Map<string, number>();
    for (const m of materials) byFilament.set(m.filamentProductId, m.grams);
    for (const [filamentProductId, grams] of byFilament) {
      this.db.insert(partMaterial).values({ partId, filamentProductId, grams }).run();
    }
  }

  private customerName(customerId: string | null): string | null {
    if (!customerId) return null;
    const c = this.db
      .select({ name: customer.name })
      .from(customer)
      .where(eq(customer.id, customerId))
      .get();
    return c?.name ?? null;
  }

  /** Compose a readable filament name, e.g. "eSUN PLA Blue". */
  private filamentLabel(row: typeof filamentProduct.$inferSelect): string {
    const parts = [row.manufacturer, row.material as Material, row.colorName].filter(
      (p): p is string => !!p && p.trim().length > 0,
    );
    return parts.join(' ');
  }

  private toPart(r: typeof part.$inferSelect): Part {
    // Join each BOM row to its filament product for label + pricing inputs.
    const bomRows = this.db
      .select()
      .from(partMaterial)
      .innerJoin(filamentProduct, eq(partMaterial.filamentProductId, filamentProduct.id))
      .where(eq(partMaterial.partId, r.id))
      .all();

    const materials: PartMaterialLine[] = bomRows.map((row) => ({
      filamentProductId: row.part_material.filamentProductId,
      filamentLabel: this.filamentLabel(row.filament_product),
      grams: row.part_material.grams,
    }));

    const rates = this.costing.getRates();
    const withPrices: PartMaterialWithPrice[] = bomRows.map((row) => ({
      grams: row.part_material.grams,
      defaultPriceMinor: row.filament_product.defaultPriceMinor,
      nominalNetWeightG: row.filament_product.nominalNetWeightG,
    }));

    const economics = computePartEconomics(
      {
        printTimeMin: r.printTimeMin,
        laborTimeMin: r.laborTimeMin,
        powerDrawW: r.powerDrawW,
        markupPct: r.markupPct,
        sellPriceMinor: r.sellPriceMinor,
      },
      withPrices,
      {
        energyPricePerKwhMinor: rates.energyPricePerKwhMinor,
        machineRatePerHourMinor: rates.machineRatePerHourMinor,
        laborRatePerHourMinor: rates.laborRatePerHourMinor,
        defaultMarkupPct: rates.defaultMarkupPct,
        defaultPowerDrawW: rates.defaultPowerDrawW,
      },
    );

    return {
      id: r.id,
      articleNo: r.articleNo,
      name: r.name,
      customerId: r.customerId,
      customerName: this.customerName(r.customerId),
      customerArticleNo: r.customerArticleNo,
      printTimeMin: r.printTimeMin,
      laborTimeMin: r.laborTimeMin,
      powerDrawW: r.powerDrawW,
      markupPct: r.markupPct,
      sellPriceMinor: r.sellPriceMinor,
      notes: r.notes,
      archived: r.archived === 1,
      materials,
      economics,
    };
  }
}
