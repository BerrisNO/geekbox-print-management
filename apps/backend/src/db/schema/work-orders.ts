import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { customer, part } from './inventory.js';

/** work_order — customer-facing production order header (Stage 2). */
export const workOrder = sqliteTable(
  'work_order',
  {
    id: text('id').primaryKey(),
    orderRef: text('order_ref'),
    customerId: text('customer_id')
      .notNull()
      .references(() => customer.id),
    orderDate: integer('order_date'),
    status: text('status').notNull().default('draft'),
    notes: text('notes'),
    archived: integer('archived').notNull().default(0),
  },
  (t) => [
    check(
      'wo_status_ck',
      sql`${t.status} IN ('draft','confirmed','in_production','completed','cancelled')`,
    ),
    index('wo_customer_idx').on(t.customerId),
  ],
);

/** work_order_line — a part × quantity with SNAPSHOT economics (Stage 2). */
export const workOrderLine = sqliteTable(
  'work_order_line',
  {
    id: text('id').primaryKey(),
    workOrderId: text('work_order_id')
      .notNull()
      .references(() => workOrder.id),
    partId: text('part_id')
      .notNull()
      .references(() => part.id),
    quantity: integer('quantity').notNull(),
    // Snapshot per-unit sell/cost taken at write time (stability). Nullable to
    // match the migration; the service always writes concrete values.
    unitPriceMinor: integer('unit_price_minor'),
    unitCostMinor: integer('unit_cost_minor'),
    notes: text('notes'),
  },
  (t) => [
    check('wol_qty_ck', sql`${t.quantity} > 0`),
    check('wol_price_ck', sql`${t.unitPriceMinor} IS NULL OR ${t.unitPriceMinor} >= 0`),
    check('wol_cost_ck', sql`${t.unitCostMinor} IS NULL OR ${t.unitCostMinor} >= 0`),
    index('wol_work_order_idx').on(t.workOrderId),
  ],
);
