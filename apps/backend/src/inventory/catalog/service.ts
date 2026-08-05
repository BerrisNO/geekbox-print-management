import type { FilamentProduct, Vendor } from '@geekbox/shared';
import {
  DENSITY_DEFAULTS_G_CM3,
  type Material,
  type ProductInput,
  type VendorInput,
} from '@geekbox/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { filamentProduct, spool, vendor } from '../../db/schema/inventory.js';
import { NotFoundError } from '../../shared/errors/index.js';
import { newId } from '../../shared/ids.js';

export class CatalogService {
  constructor(private readonly db: Db) {}

  // ---- vendors (FR-201) ----
  listVendors(includeArchived = false): Vendor[] {
    const rows = this.db.select().from(vendor).all();
    return rows.filter((r) => includeArchived || r.archived === 0).map(this.toVendor);
  }

  getVendor(id: string): Vendor {
    const row = this.db.select().from(vendor).where(eq(vendor.id, id)).get();
    if (!row) throw new NotFoundError('Vendor');
    return this.toVendor(row);
  }

  createVendor(input: VendorInput): Vendor {
    const id = newId();
    this.db
      .insert(vendor)
      .values({
        id,
        name: input.name,
        url: input.url ?? null,
        notes: input.notes ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        archived: 0,
      })
      .run();
    return this.getVendor(id);
  }

  updateVendor(id: string, input: Partial<VendorInput>): Vendor {
    this.getVendor(id);
    this.db
      .update(vendor)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
      })
      .where(eq(vendor.id, id))
      .run();
    return this.getVendor(id);
  }

  archiveVendor(id: string): Vendor {
    this.getVendor(id);
    this.db.update(vendor).set({ archived: 1 }).where(eq(vendor.id, id)).run();
    return this.getVendor(id);
  }

  private toVendor = (r: typeof vendor.$inferSelect): Vendor => ({
    id: r.id,
    name: r.name,
    url: r.url,
    notes: r.notes,
    leadTimeDays: r.leadTimeDays,
    archived: r.archived === 1,
  });

  // ---- products (FR-101) ----
  listProducts(filter: {
    material?: Material;
    vendorId?: string;
    includeArchived?: boolean;
  }): FilamentProduct[] {
    const rows = this.db.select().from(filamentProduct).all();
    return rows
      .filter((r) => filter.includeArchived || r.archived === 0)
      .filter((r) => !filter.material || r.material === filter.material)
      .filter((r) => !filter.vendorId || r.vendorId === filter.vendorId)
      .map((r) => this.toProduct(r));
  }

  getProduct(id: string): FilamentProduct {
    const row = this.db.select().from(filamentProduct).where(eq(filamentProduct.id, id)).get();
    if (!row) throw new NotFoundError('Product');
    return this.toProduct(row);
  }

  createProduct(input: ProductInput): FilamentProduct {
    // vendor must exist
    const v = this.db.select().from(vendor).where(eq(vendor.id, input.vendorId)).get();
    if (!v) throw new NotFoundError('Vendor');
    const id = newId();
    const density = input.densityGCm3 ?? DENSITY_DEFAULTS_G_CM3[input.material];
    this.db
      .insert(filamentProduct)
      .values({
        id,
        material: input.material,
        colorName: input.colorName,
        colorHex: input.colorHex ?? null,
        vendorId: input.vendorId,
        diameterMm: input.diameterMm ?? 1.75,
        nominalNetWeightG: input.nominalNetWeightG,
        defaultPriceMinor: input.defaultPriceMinor ?? 0,
        densityGCm3: density,
        lowStockThresholdG: input.lowStockThresholdG ?? null,
        lowStockMinSpools: input.lowStockMinSpools ?? null,
        sku: input.sku ?? null,
        notes: input.notes ?? null,
        archived: 0,
      })
      .run();
    return this.getProduct(id);
  }

  updateProduct(id: string, input: Partial<ProductInput>): FilamentProduct {
    this.getProduct(id);
    this.db
      .update(filamentProduct)
      .set({
        ...(input.material !== undefined ? { material: input.material } : {}),
        ...(input.colorName !== undefined ? { colorName: input.colorName } : {}),
        ...(input.colorHex !== undefined ? { colorHex: input.colorHex } : {}),
        ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
        ...(input.diameterMm !== undefined ? { diameterMm: input.diameterMm } : {}),
        ...(input.nominalNetWeightG !== undefined
          ? { nominalNetWeightG: input.nominalNetWeightG }
          : {}),
        ...(input.defaultPriceMinor !== undefined
          ? { defaultPriceMinor: input.defaultPriceMinor }
          : {}),
        ...(input.densityGCm3 !== undefined ? { densityGCm3: input.densityGCm3 } : {}),
        ...(input.lowStockThresholdG !== undefined
          ? { lowStockThresholdG: input.lowStockThresholdG }
          : {}),
        ...(input.lowStockMinSpools !== undefined
          ? { lowStockMinSpools: input.lowStockMinSpools }
          : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(eq(filamentProduct.id, id))
      .run();
    return this.getProduct(id);
  }

  archiveProduct(id: string): FilamentProduct {
    this.getProduct(id);
    this.db.update(filamentProduct).set({ archived: 1 }).where(eq(filamentProduct.id, id)).run();
    return this.getProduct(id);
  }

  /** Whether a product has any non-archived spools (informational). */
  hasActiveSpools(productId: string): boolean {
    const row = this.db
      .select({ id: spool.id })
      .from(spool)
      .where(and(eq(spool.productId, productId), eq(spool.status, 'in_stock')))
      .get();
    return row !== undefined;
  }

  vendorName(vendorId: string): string {
    const v = this.db
      .select({ name: vendor.name })
      .from(vendor)
      .where(eq(vendor.id, vendorId))
      .get();
    return v?.name ?? '';
  }

  private toProduct(r: typeof filamentProduct.$inferSelect): FilamentProduct {
    return {
      id: r.id,
      material: r.material as Material,
      colorName: r.colorName,
      colorHex: r.colorHex,
      vendorId: r.vendorId,
      vendorName: this.vendorName(r.vendorId),
      diameterMm: r.diameterMm,
      nominalNetWeightG: r.nominalNetWeightG,
      defaultPriceMinor: r.defaultPriceMinor,
      densityGCm3: r.densityGCm3,
      lowStockThresholdG: r.lowStockThresholdG,
      lowStockMinSpools: r.lowStockMinSpools,
      sku: r.sku,
      notes: r.notes,
      archived: r.archived === 1,
    };
  }
}
