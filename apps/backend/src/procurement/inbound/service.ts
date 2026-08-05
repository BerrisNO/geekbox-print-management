import type { InboundRow, Material } from '@geekbox/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { filamentProduct, vendor } from '../../db/schema/inventory.js';
import { goodsReceiptLine, purchaseOrder, purchaseOrderLine } from '../../db/schema/procurement.js';

/** Inbound overview read model (FR-204): ordered/partially_received sorted by ETA asc, overdue flagged, no-ETA last. */
export class InboundService {
  constructor(private readonly db: Db) {}

  overview(): InboundRow[] {
    const pos = this.db
      .select()
      .from(purchaseOrder)
      .where(inArray(purchaseOrder.status, ['ordered', 'partially_received']))
      .all();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const rows: InboundRow[] = pos.map((po) => {
      const v = this.db
        .select({ name: vendor.name })
        .from(vendor)
        .where(eq(vendor.id, po.vendorId))
        .get();
      const lines = this.db
        .select()
        .from(purchaseOrderLine)
        .where(eq(purchaseOrderLine.purchaseOrderId, po.id))
        .all();
      const outstandingLines = [];
      let totalOutstandingQty = 0;
      let outstandingValueMinor = 0;
      for (const l of lines) {
        const received = this.db
          .select()
          .from(goodsReceiptLine)
          .where(eq(goodsReceiptLine.poLineId, l.id))
          .all()
          .reduce((a, r) => a + r.quantityReceived, 0);
        const outstanding = Math.max(0, l.quantityOrdered - received);
        if (outstanding > 0) {
          const prod = this.db
            .select()
            .from(filamentProduct)
            .where(eq(filamentProduct.id, l.productId))
            .get();
          outstandingLines.push({
            poLineId: l.id,
            productId: l.productId,
            material: (prod?.material ?? 'OTHER') as Material,
            colorName: prod?.colorName ?? '',
            quantityOutstanding: outstanding,
          });
          totalOutstandingQty += outstanding;
          outstandingValueMinor += outstanding * l.unitPriceMinor;
        }
      }
      const daysUntil =
        po.expectedArrival != null ? Math.ceil((po.expectedArrival - now) / dayMs) : null;
      const overdue = po.expectedArrival != null && po.expectedArrival < now;
      return {
        purchaseOrderId: po.id,
        vendorId: po.vendorId,
        vendorName: v?.name ?? '',
        status: po.status as 'ordered' | 'partially_received',
        expectedArrival:
          po.expectedArrival != null
            ? new Date(po.expectedArrival).toISOString().slice(0, 10)
            : null,
        daysUntil,
        overdue,
        outstandingLines,
        totalOutstandingQty,
        outstandingValueMinor,
      };
    });

    // Sort: ETA asc, no-ETA last (ES-204.1).
    rows.sort((a, b) => {
      if (a.expectedArrival == null && b.expectedArrival == null) return 0;
      if (a.expectedArrival == null) return 1;
      if (b.expectedArrival == null) return -1;
      return a.expectedArrival.localeCompare(b.expectedArrival);
    });
    return rows;
  }
}
