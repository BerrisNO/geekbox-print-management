import type { LowStockAlert, Material, ProductStockRow } from '@geekbox/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { filamentProduct, spool, vendor } from '../../db/schema/inventory.js';
import { goodsReceiptLine, purchaseOrder, purchaseOrderLine } from '../../db/schema/procurement.js';
import { nowMs } from '../../shared/ids.js';
import { spoolValuationMinor } from '../../shared/money.js';

/**
 * Inventory valuation/summary (FR-105/108) + low-stock alerts (FR-106) with
 * on-order lookahead (AC-106.3). Read models computed per request.
 */
export class InventoryReadService {
  constructor(private readonly db: Db) {}

  summary(): ProductStockRow[] {
    const products = this.db.select().from(filamentProduct).all();
    return products.map((p) => this.stockRow(p));
  }

  stockRowById(productId: string): ProductStockRow | null {
    const p = this.db.select().from(filamentProduct).where(eq(filamentProduct.id, productId)).get();
    if (!p) return null;
    return this.stockRow(p);
  }

  private stockRow(p: typeof filamentProduct.$inferSelect): ProductStockRow {
    const spools = this.db.select().from(spool).where(eq(spool.productId, p.id)).all();
    const usable = spools.filter((s) => s.status === 'in_stock' || s.status === 'in_use');
    const totalRemainingG = usable.reduce((acc, s) => acc + s.remainingNetWeightG, 0);
    let valuationMinor = 0;
    let anyEstimated = false;
    for (const s of usable) {
      const price = s.purchasePriceMinor ?? p.defaultPriceMinor;
      if (s.purchasePriceMinor == null) anyEstimated = true;
      valuationMinor += spoolValuationMinor(price, s.initialNetWeightG, s.remainingNetWeightG);
    }
    const v = this.db
      .select({ name: vendor.name })
      .from(vendor)
      .where(eq(vendor.id, p.vendorId))
      .get();
    return {
      productId: p.id,
      material: p.material as Material,
      colorName: p.colorName,
      colorHex: p.colorHex,
      vendorId: p.vendorId,
      vendorName: v?.name ?? '',
      usableSpools: usable.length,
      totalRemainingG,
      valuationMinor,
      valuationEstimated: anyEstimated,
      lowStockActive: this.isLowStock(p, totalRemainingG, usable.length),
    };
  }

  private isLowStock(
    p: typeof filamentProduct.$inferSelect,
    totalRemainingG: number,
    usableSpools: number,
  ): boolean {
    if (p.lowStockThresholdG != null && totalRemainingG < p.lowStockThresholdG) return true;
    if (p.lowStockMinSpools != null && usableSpools < p.lowStockMinSpools) return true;
    return false;
  }

  /** On-order outstanding quantity + earliest ETA for a product across open POs. */
  private onOrder(productId: string): { qty: number; earliestEta: string | null } {
    const openPos = this.db
      .select()
      .from(purchaseOrder)
      .where(inArray(purchaseOrder.status, ['ordered', 'partially_received']))
      .all();
    let qty = 0;
    let earliest: number | null = null;
    for (const po of openPos) {
      const lines = this.db
        .select()
        .from(purchaseOrderLine)
        .where(eq(purchaseOrderLine.purchaseOrderId, po.id))
        .all()
        .filter((l) => l.productId === productId);
      for (const line of lines) {
        const received = this.db
          .select()
          .from(goodsReceiptLine)
          .where(eq(goodsReceiptLine.poLineId, line.id))
          .all()
          .reduce((acc, r) => acc + r.quantityReceived, 0);
        const outstanding = Math.max(0, line.quantityOrdered - received);
        if (outstanding > 0) {
          qty += outstanding;
          if (po.expectedArrival != null && (earliest == null || po.expectedArrival < earliest)) {
            earliest = po.expectedArrival;
          }
        }
      }
    }
    return {
      qty,
      earliestEta: earliest != null ? new Date(earliest).toISOString().slice(0, 10) : null,
    };
  }

  alerts(): LowStockAlert[] {
    const products = this.db.select().from(filamentProduct).all();
    const out: LowStockAlert[] = [];
    for (const p of products) {
      if (p.lowStockThresholdG == null && p.lowStockMinSpools == null) continue; // opt-in only
      const spools = this.db.select().from(spool).where(eq(spool.productId, p.id)).all();
      const usable = spools.filter((s) => s.status === 'in_stock' || s.status === 'in_use');
      const totalRemainingG = usable.reduce((acc, s) => acc + s.remainingNetWeightG, 0);
      if (!this.isLowStock(p, totalRemainingG, usable.length)) continue;
      const { qty, earliestEta } = this.onOrder(p.id);
      out.push({
        productId: p.id,
        material: p.material as Material,
        colorName: p.colorName,
        thresholdG: p.lowStockThresholdG,
        minSpools: p.lowStockMinSpools,
        currentRemainingG: totalRemainingG,
        currentUsableSpools: usable.length,
        onOrderQty: qty,
        earliestEta,
        activeSince: new Date(nowMs()).toISOString(),
      });
    }
    return out;
  }
}
