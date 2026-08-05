import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** vendor — shared kernel with Procurement (FR-201). */
export const vendor = sqliteTable('vendor', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url'),
  notes: text('notes'),
  leadTimeDays: integer('lead_time_days'),
  archived: integer('archived').notNull().default(0),
});

/** filament_product (FR-101, FR-106). */
export const filamentProduct = sqliteTable(
  'filament_product',
  {
    id: text('id').primaryKey(),
    material: text('material').notNull(),
    manufacturer: text('manufacturer'),
    name: text('name'),
    category: text('category'),
    spoolType: text('spool_type').notNull().default('plastic'),
    colorName: text('color_name').notNull(),
    colorHex: text('color_hex'),
    vendorId: text('vendor_id')
      .notNull()
      .references(() => vendor.id),
    diameterMm: real('diameter_mm').notNull().default(1.75),
    nominalNetWeightG: integer('nominal_net_weight_g').notNull(),
    defaultPriceMinor: integer('default_price_minor').notNull().default(0),
    densityGCm3: real('density_g_cm3').notNull(),
    lowStockThresholdG: integer('low_stock_threshold_g'),
    lowStockMinSpools: integer('low_stock_min_spools'),
    sku: text('sku'),
    notes: text('notes'),
    archived: integer('archived').notNull().default(0),
  },
  (t) => [
    check(
      'filament_product_material_ck',
      sql`${t.material} IN ('PLA','PETG','ABS','TPU','ASA','PC','PA','SUPPORT','OTHER')`,
    ),
    check('filament_product_diameter_ck', sql`${t.diameterMm} IN (1.75, 2.85)`),
    check('filament_product_nom_weight_ck', sql`${t.nominalNetWeightG} > 0`),
    check('filament_product_default_price_ck', sql`${t.defaultPriceMinor} >= 0`),
    check(
      'filament_product_spool_type_ck',
      sql`${t.spoolType} IN ('plastic','cardboard','refill','reusable')`,
    ),
  ],
);

/** spool — aggregate root (FR-102/103/107). */
export const spool = sqliteTable(
  'spool',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull().unique(),
    productId: text('product_id')
      .notNull()
      .references(() => filamentProduct.id),
    initialNetWeightG: integer('initial_net_weight_g').notNull(),
    remainingNetWeightG: real('remaining_net_weight_g').notNull(),
    tareWeightG: integer('tare_weight_g'),
    purchasePriceMinor: integer('purchase_price_minor'),
    source: text('source').notNull(),
    goodsReceiptLineId: text('goods_receipt_line_id'),
    status: text('status').notNull(),
    acquiredAt: integer('acquired_at').notNull(),
    notes: text('notes'),
  },
  (t) => [
    check(
      'spool_initial_weight_ck',
      sql`${t.initialNetWeightG} > 0 AND ${t.initialNetWeightG} <= 20000`,
    ),
    check('spool_remaining_ck', sql`${t.remainingNetWeightG} >= 0`),
    check('spool_source_ck', sql`${t.source} IN ('goods_reception','manual')`),
    check('spool_status_ck', sql`${t.status} IN ('in_stock','in_use','depleted','archived')`),
    index('spool_product_status_idx').on(t.productId, t.status),
  ],
);

/** spool_ledger_entry — immutable, append-only (FR-103, ADR-009). */
export const spoolLedgerEntry = sqliteTable(
  'spool_ledger_entry',
  {
    id: text('id').primaryKey(),
    spoolId: text('spool_id')
      .notNull()
      .references(() => spool.id),
    type: text('type').notNull(),
    deltaG: real('delta_g').notNull(),
    /**
     * Effective post-floor change to the balance (`balance_after_g` minus the
     * previous balance). Equals delta_g except when floor-at-zero clamped an
     * over-consumption, where it is smaller in magnitude. Reversals negate THIS,
     * never the nominal delta_g, so filament is conserved exactly (ADR-009,
     * BUG-001/MR-004).
     */
    appliedDeltaG: real('applied_delta_g').notNull().default(0),
    balanceAfterG: real('balance_after_g').notNull(),
    jobId: text('job_id'),
    slotRef: text('slot_ref'),
    reversesEntryId: text('reverses_entry_id'),
    estimated: integer('estimated').notNull().default(0),
    overConsumption: integer('over_consumption').notNull().default(0),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    check(
      'ledger_type_ck',
      sql`${t.type} IN ('initial','consumption','manual_adjustment','reversal')`,
    ),
    check('ledger_balance_ck', sql`${t.balanceAfterG} >= 0`),
    // ADR-009 constraint (c): an entry can be reversed at most once.
    uniqueIndex('ledger_reverses_uq')
      .on(t.reversesEntryId)
      .where(sql`${t.reversesEntryId} IS NOT NULL`),
    index('ledger_spool_created_idx').on(t.spoolId, sql`${t.createdAt} DESC`),
  ],
);

/** ams_slot_mapping — owned by Inventory; external holder unit 254 (ADR-011). */
export const amsSlotMapping = sqliteTable(
  'ams_slot_mapping',
  {
    id: text('id').primaryKey(),
    printerId: text('printer_id').notNull(),
    unitIndex: integer('unit_index').notNull(),
    slotIndex: integer('slot_index').notNull(),
    spoolId: text('spool_id')
      .notNull()
      .references(() => spool.id),
    mappedAt: integer('mapped_at').notNull(),
    verifyFlag: integer('verify_flag').notNull().default(0),
    verifyReason: text('verify_reason'),
  },
  (t) => [
    check('ams_unit_ck', sql`(${t.unitIndex} BETWEEN 0 AND 3) OR ${t.unitIndex} = 254`),
    check(
      'ams_slot_ck',
      sql`(${t.slotIndex} BETWEEN 0 AND 3) AND (${t.unitIndex} != 254 OR ${t.slotIndex} = 0)`,
    ),
    uniqueIndex('ams_slot_uq').on(t.printerId, t.unitIndex, t.slotIndex),
    // A spool mounts one place at a time.
    uniqueIndex('ams_spool_uq').on(t.spoolId),
  ],
);
