import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { filamentProduct } from '../../src/db/schema/inventory.js';
import { CatalogService } from '../../src/inventory/catalog/service.js';
import { makeTestDb } from './_setup.js';

/**
 * User-editable material catalog (migration 0007). Materials replaced the
 * hardcoded enum: the seed list must survive the migration, product material
 * values are validated against the table, and renames cascade onto products.
 */
describe('CatalogService materials', () => {
  let db: Db;
  let catalog: CatalogService;

  beforeEach(() => {
    db = makeTestDb();
    catalog = new CatalogService(db);
  });

  it('seeds the built-in materials with their densities', () => {
    const materials = catalog.listMaterials();
    const names = materials.map((m) => m.name);
    for (const name of ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'PC', 'PA', 'SUPPORT', 'OTHER']) {
      expect(names).toContain(name);
    }
    expect(materials.find((m) => m.name === 'PLA')?.densityGCm3).toBe(1.24);
    expect(materials.find((m) => m.name === 'PETG')?.densityGCm3).toBe(1.27);
  });

  it('creates a custom material and uses its density for new products', () => {
    const mat = catalog.createMaterial({ name: 'PCTG', densityGCm3: 1.23 });
    expect(mat.name).toBe('PCTG');
    const v = catalog.createVendor({ name: 'Acme' });
    const p = catalog.createProduct({
      material: 'PCTG',
      spoolType: 'plastic',
      colorName: 'Black',
      vendorId: v.id,
      diameterMm: 1.75,
      nominalNetWeightG: 1000,
    });
    expect(p.material).toBe('PCTG');
    expect(p.densityGCm3).toBe(1.23);
  });

  it('rejects duplicate names case-insensitively', () => {
    expect(() => catalog.createMaterial({ name: 'pla' })).toThrow(/already exists/i);
  });

  it('rejects products with an unknown material', () => {
    const v = catalog.createVendor({ name: 'Acme' });
    expect(() =>
      catalog.createProduct({
        material: 'UNOBTAINIUM',
        spoolType: 'plastic',
        colorName: 'Black',
        vendorId: v.id,
        diameterMm: 1.75,
        nominalNetWeightG: 1000,
      }),
    ).toThrow(/unknown material/i);
  });

  it('normalizes product material casing to the catalog name', () => {
    const v = catalog.createVendor({ name: 'Acme' });
    const p = catalog.createProduct({
      material: 'pla',
      spoolType: 'plastic',
      colorName: 'Black',
      vendorId: v.id,
      diameterMm: 1.75,
      nominalNetWeightG: 1000,
    });
    expect(p.material).toBe('PLA');
  });

  it('renaming a material cascades onto its products', () => {
    const v = catalog.createVendor({ name: 'Acme' });
    const p = catalog.createProduct({
      material: 'PLA',
      spoolType: 'plastic',
      colorName: 'Black',
      vendorId: v.id,
      diameterMm: 1.75,
      nominalNetWeightG: 1000,
    });
    const pla = catalog.listMaterials().find((m) => m.name === 'PLA')!;
    expect(pla.productCount).toBe(1);
    catalog.updateMaterial(pla.id, { name: 'PLA+' });
    const row = db.select().from(filamentProduct).where(eq(filamentProduct.id, p.id)).get()!;
    expect(row.material).toBe('PLA+');
    expect(catalog.getProduct(p.id).material).toBe('PLA+');
  });

  it('archiving hides a material from the active list but keeps products intact', () => {
    const v = catalog.createVendor({ name: 'Acme' });
    const p = catalog.createProduct({
      material: 'ASA',
      spoolType: 'plastic',
      colorName: 'White',
      vendorId: v.id,
      diameterMm: 1.75,
      nominalNetWeightG: 1000,
    });
    const asa = catalog.listMaterials().find((m) => m.name === 'ASA')!;
    catalog.archiveMaterial(asa.id);
    expect(catalog.listMaterials().some((m) => m.name === 'ASA')).toBe(false);
    expect(catalog.listMaterials(true).some((m) => m.name === 'ASA')).toBe(true);
    expect(catalog.getProduct(p.id).material).toBe('ASA');
  });
});
