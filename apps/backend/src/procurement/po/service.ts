import type {
  Material,
  PoStatus,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderInput,
  PurchaseOrderLine,
  PurchaseOrderPatch,
} from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { filamentProduct, vendor } from '../../db/schema/inventory.js';
import {
  goodsReceipt,
  goodsReceiptLine,
  poStatusEvent,
  purchaseOrder,
  purchaseOrderLine,
} from '../../db/schema/procurement.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';

export class PurchaseOrderService {
  constructor(private readonly db: Db) {}

  list(status?: string): PurchaseOrder[] {
    const rows = this.db.select().from(purchaseOrder).all();
    return rows.filter((r) => !status || r.status === status).map((r) => this.toPo(r));
  }

  get(id: string): PurchaseOrder {
    const row = this.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, id)).get();
    if (!row) throw new NotFoundError('Purchase order');
    return this.toPo(row);
  }

  getDetail(id: string): PurchaseOrderDetail {
    const po = this.get(id);
    const events = this.db
      .select()
      .from(poStatusEvent)
      .where(eq(poStatusEvent.purchaseOrderId, id))
      .all()
      .sort((a, b) => a.occurredAt - b.occurredAt)
      .map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        occurredAt: new Date(e.occurredAt).toISOString(),
      }));
    const receipts = this.db
      .select()
      .from(goodsReceipt)
      .where(eq(goodsReceipt.purchaseOrderId, id))
      .all();
    const receiptViews = receipts.map((r) => {
      const lines = this.db
        .select()
        .from(goodsReceiptLine)
        .where(eq(goodsReceiptLine.goodsReceiptId, r.id))
        .all();
      return {
        id: r.id,
        purchaseOrderId: r.purchaseOrderId,
        receivedAt: new Date(r.receivedAt).toISOString(),
        notes: r.notes,
        lines: lines.map((l) => ({
          id: l.id,
          poLineId: l.poLineId,
          quantityReceived: l.quantityReceived,
          quantityDamaged: l.quantityDamaged,
          actualUnitPriceMinor: l.actualUnitPriceMinor,
          overDelivery: l.overDelivery === 1,
          discrepancyNote: l.discrepancyNote,
        })),
      };
    });
    return { ...po, statusEvents: events, receipts: receiptViews };
  }

  create(input: PurchaseOrderInput): PurchaseOrder {
    const v = this.db.select().from(vendor).where(eq(vendor.id, input.vendorId)).get();
    if (!v) throw new NotFoundError('Vendor');
    const id = newId();
    const now = nowMs();
    const orderDate = new Date(input.orderDate).getTime();
    let expectedArrival: number | null = input.expectedArrival
      ? new Date(input.expectedArrival).getTime()
      : null;
    // Default ETA = orderDate + vendor.lead_time_days (AC-201.2).
    if (expectedArrival == null && v.leadTimeDays != null) {
      expectedArrival = orderDate + v.leadTimeDays * 24 * 60 * 60 * 1000;
    }
    this.db.transaction(() => {
      this.db
        .insert(purchaseOrder)
        .values({
          id,
          vendorId: input.vendorId,
          status: 'draft',
          orderDate,
          expectedArrival,
          externalRef: input.externalRef ?? null,
          notes: input.notes ?? null,
          shippingCostMinor: input.shippingCostMinor ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const line of input.lines) {
        this.db
          .insert(purchaseOrderLine)
          .values({
            id: newId(),
            purchaseOrderId: id,
            productId: line.productId,
            quantityOrdered: line.quantityOrdered,
            unitPriceMinor: line.unitPriceMinor,
            expectedWeightOverrideG: line.expectedWeightOverrideG ?? null,
          })
          .run();
      }
    });
    return this.get(id);
  }

  update(id: string, patch: PurchaseOrderPatch): PurchaseOrder {
    const row = this.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, id)).get();
    if (!row) throw new NotFoundError('Purchase order');
    // Draft = full edit; ordered = expectedArrival/notes only, lines locked (AC-202.3).
    if (row.status !== 'draft' && patch.lines !== undefined) {
      throw new ConflictError('PO_LINES_LOCKED', 'Lines cannot be edited once ordered');
    }
    if (row.status !== 'draft' && row.status !== 'ordered') {
      throw new ConflictError(
        'PO_NOT_EDITABLE',
        'Purchase order cannot be edited in its current status',
      );
    }
    this.db.transaction(() => {
      this.db
        .update(purchaseOrder)
        .set({
          ...(patch.expectedArrival !== undefined
            ? {
                expectedArrival: patch.expectedArrival
                  ? new Date(patch.expectedArrival).getTime()
                  : null,
              }
            : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          updatedAt: nowMs(),
        })
        .where(eq(purchaseOrder.id, id))
        .run();
      if (patch.lines && row.status === 'draft') {
        this.db.delete(purchaseOrderLine).where(eq(purchaseOrderLine.purchaseOrderId, id)).run();
        for (const line of patch.lines) {
          this.db
            .insert(purchaseOrderLine)
            .values({
              id: newId(),
              purchaseOrderId: id,
              productId: line.productId,
              quantityOrdered: line.quantityOrdered,
              unitPriceMinor: line.unitPriceMinor,
              expectedWeightOverrideG: line.expectedWeightOverrideG ?? null,
            })
            .run();
        }
      }
    });
    return this.get(id);
  }

  transitionStatus(id: string, target: 'ordered' | 'cancelled'): PurchaseOrderDetail {
    const row = this.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, id)).get();
    if (!row) throw new NotFoundError('Purchase order');
    const from = row.status as PoStatus;
    if (target === 'ordered') {
      if (from !== 'draft')
        throw new ConflictError('PO_ILLEGAL_TRANSITION', 'Only draft POs can be ordered');
      const lines = this.db
        .select()
        .from(purchaseOrderLine)
        .where(eq(purchaseOrderLine.purchaseOrderId, id))
        .all();
      if (lines.length === 0)
        throw new ConflictError('PO_NO_LINES', 'Cannot order a PO with no lines (ES-202.1)');
    } else if (target === 'cancelled') {
      if (from !== 'draft' && from !== 'ordered') {
        throw new ConflictError('PO_ILLEGAL_TRANSITION', 'Only draft/ordered POs can be cancelled');
      }
    }
    this.db.transaction(() => {
      this.db
        .update(purchaseOrder)
        .set({ status: target, updatedAt: nowMs() })
        .where(eq(purchaseOrder.id, id))
        .run();
      this.recordStatusEvent(id, from, target);
    });
    return this.getDetail(id);
  }

  recordStatusEvent(poId: string, from: string, to: string): void {
    this.db
      .insert(poStatusEvent)
      .values({
        id: newId(),
        purchaseOrderId: poId,
        fromStatus: from,
        toStatus: to,
        occurredAt: nowMs(),
      })
      .run();
  }

  /** Received qty for a PO line (derived, never stored). */
  receivedForLine(poLineId: string): number {
    return this.db
      .select()
      .from(goodsReceiptLine)
      .where(eq(goodsReceiptLine.poLineId, poLineId))
      .all()
      .reduce((acc, r) => acc + r.quantityReceived, 0);
  }

  private toPo(r: typeof purchaseOrder.$inferSelect): PurchaseOrder {
    const v = this.db
      .select({ name: vendor.name })
      .from(vendor)
      .where(eq(vendor.id, r.vendorId))
      .get();
    const lines = this.db
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.purchaseOrderId, r.id))
      .all();
    const lineViews: PurchaseOrderLine[] = lines.map((l) => {
      const prod = this.db
        .select()
        .from(filamentProduct)
        .where(eq(filamentProduct.id, l.productId))
        .get();
      const received = this.receivedForLine(l.id);
      return {
        id: l.id,
        productId: l.productId,
        product: {
          material: (prod?.material ?? 'OTHER') as Material,
          colorName: prod?.colorName ?? '',
          colorHex: prod?.colorHex ?? null,
        },
        quantityOrdered: l.quantityOrdered,
        unitPriceMinor: l.unitPriceMinor,
        expectedWeightOverrideG: l.expectedWeightOverrideG,
        quantityReceived: received,
        quantityOutstanding: Math.max(0, l.quantityOrdered - received),
      };
    });
    const totals = {
      quantityOrdered: lineViews.reduce((a, l) => a + l.quantityOrdered, 0),
      quantityReceived: lineViews.reduce((a, l) => a + l.quantityReceived, 0),
      goodsValueMinor: lineViews.reduce((a, l) => a + l.quantityOrdered * l.unitPriceMinor, 0),
    };
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: v?.name ?? '',
      status: r.status as PoStatus,
      orderDate: new Date(r.orderDate).toISOString().slice(0, 10),
      expectedArrival:
        r.expectedArrival != null ? new Date(r.expectedArrival).toISOString().slice(0, 10) : null,
      externalRef: r.externalRef,
      notes: r.notes,
      shippingCostMinor: r.shippingCostMinor,
      lines: lineViews,
      totals,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  }
}
