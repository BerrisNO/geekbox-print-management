import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { filamentProduct, vendor } from './inventory.js';

/** purchase_order (FR-202/203). */
export const purchaseOrder = sqliteTable(
  'purchase_order',
  {
    id: text('id').primaryKey(),
    vendorId: text('vendor_id')
      .notNull()
      .references(() => vendor.id),
    status: text('status').notNull(),
    orderDate: integer('order_date').notNull(),
    expectedArrival: integer('expected_arrival'),
    externalRef: text('external_ref'),
    notes: text('notes'),
    shippingCostMinor: integer('shipping_cost_minor'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    check(
      'po_status_ck',
      sql`${t.status} IN ('draft','ordered','partially_received','received','cancelled')`,
    ),
    check('po_shipping_ck', sql`${t.shippingCostMinor} IS NULL OR ${t.shippingCostMinor} >= 0`),
    index('po_status_eta_idx').on(t.status, t.expectedArrival),
  ],
);

/** po_status_event (FR-203). */
export const poStatusEvent = sqliteTable('po_status_event', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .references(() => purchaseOrder.id),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  occurredAt: integer('occurred_at').notNull(),
});

/** purchase_order_line (FR-202). quantity_received is DERIVED, never stored. */
export const purchaseOrderLine = sqliteTable(
  'purchase_order_line',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrder.id),
    productId: text('product_id')
      .notNull()
      .references(() => filamentProduct.id),
    quantityOrdered: integer('quantity_ordered').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    expectedWeightOverrideG: integer('expected_weight_override_g'),
  },
  (t) => [
    check('pol_qty_ck', sql`${t.quantityOrdered} > 0`),
    check('pol_price_ck', sql`${t.unitPriceMinor} >= 0`),
    check(
      'pol_weight_ck',
      sql`${t.expectedWeightOverrideG} IS NULL OR ${t.expectedWeightOverrideG} > 0`,
    ),
  ],
);

/** goods_receipt (FR-205). */
export const goodsReceipt = sqliteTable('goods_receipt', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .references(() => purchaseOrder.id),
  receivedAt: integer('received_at').notNull(),
  notes: text('notes'),
});

/** goods_receipt_line (FR-205/206/207). */
export const goodsReceiptLine = sqliteTable(
  'goods_receipt_line',
  {
    id: text('id').primaryKey(),
    goodsReceiptId: text('goods_receipt_id')
      .notNull()
      .references(() => goodsReceipt.id),
    poLineId: text('po_line_id')
      .notNull()
      .references(() => purchaseOrderLine.id),
    quantityReceived: integer('quantity_received').notNull(),
    quantityDamaged: integer('quantity_damaged').notNull().default(0),
    actualUnitPriceMinor: integer('actual_unit_price_minor'),
    overDelivery: integer('over_delivery').notNull().default(0),
    discrepancyNote: text('discrepancy_note'),
  },
  (t) => [
    check('grl_qty_ck', sql`${t.quantityReceived} > 0`),
    check(
      'grl_damaged_ck',
      sql`${t.quantityDamaged} >= 0 AND ${t.quantityDamaged} <= ${t.quantityReceived}`,
    ),
    index('grl_po_line_idx').on(t.poLineId),
  ],
);
