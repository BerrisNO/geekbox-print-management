import type { GoodsReceipt, GoodsReceiptDetail, ReceptionInput, SpoolType } from '@geekbox/shared';
import { SPOOL_TYPE_TARE_DEFAULTS_G } from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { EventBus } from '../../bus/event-bus.js';
import type { Db } from '../../db/client.js';
import { filamentProduct, spool } from '../../db/schema/inventory.js';
import {
  goodsReceipt,
  goodsReceiptLine,
  purchaseOrder,
  purchaseOrderLine,
} from '../../db/schema/procurement.js';
import type { LedgerWriter } from '../../inventory/ledger/ledger-write.js';
import type { SpoolService } from '../../inventory/spool/service.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';
import type { PurchaseOrderService } from '../po/service.js';

export type ReceptionResultInternal = {
  receipt: GoodsReceipt;
  createdSpoolIds: string[];
  purchaseOrderStatus: 'ordered' | 'partially_received' | 'received';
};

/**
 * Atomic reception posting (FR-205, NFR-RE-03). ONE SQLite transaction:
 * insert receipt + lines + N spools (+ initial ledger entries) + PO status
 * recompute + status event. Emits post-commit events for alerts/SSE.
 */
export class ReceptionService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerWriter,
    private readonly spools: SpoolService,
    private readonly po: PurchaseOrderService,
    private readonly bus: EventBus,
  ) {}

  private nextLabel(): string {
    // Derive from the max existing S-#### suffix, guarded by a taken-set. Called
    // per spool inside the tx; already-inserted batch spools are visible, so each
    // call returns the next free label without needing an external offset.
    const labels = this.db.select({ label: spool.label }).from(spool).all();
    const taken = new Set(labels.map((r) => r.label));
    let max = 0;
    for (const { label } of labels) {
      const m = /^S-(\d+)$/.exec(label);
      if (m) max = Math.max(max, Number(m[1]));
    }
    let n = max + 1;
    let label = `S-${String(n).padStart(4, '0')}`;
    while (taken.has(label)) label = `S-${String(++n).padStart(4, '0')}`;
    return label;
  }

  post(purchaseOrderId: string, input: ReceptionInput): ReceptionResultInternal {
    const poRow = this.db
      .select()
      .from(purchaseOrder)
      .where(eq(purchaseOrder.id, purchaseOrderId))
      .get();
    if (!poRow) throw new NotFoundError('Purchase order');
    if (poRow.status !== 'ordered' && poRow.status !== 'partially_received') {
      throw new ConflictError('PO_NOT_RECEIVABLE', 'PO is not in a receivable state (ES-203.1)');
    }

    // Pre-validate every line before opening the transaction.
    const poLines = this.db
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.purchaseOrderId, purchaseOrderId))
      .all();
    const poLineById = new Map(poLines.map((l) => [l.id, l]));
    for (const line of input.lines) {
      const poLine = poLineById.get(line.poLineId);
      if (!poLine) throw new NotFoundError(`PO line ${line.poLineId}`);
      if (line.quantityDamaged > line.quantityReceived) {
        throw new UnprocessableError(
          'DAMAGED_EXCEEDS_RECEIVED',
          'Damaged quantity exceeds received (ES-207.1)',
        );
      }
      const received = this.po.receivedForLine(poLine.id);
      const outstanding = Math.max(0, poLine.quantityOrdered - received);
      if (line.quantityReceived > outstanding && !line.confirmOverDelivery) {
        throw new UnprocessableError(
          'OVER_DELIVERY_UNCONFIRMED',
          'Over-delivery must be confirmed (ES-205.1)',
        );
      }
    }

    const createdSpoolIds: string[] = [];
    const productIds = new Set<string>();
    const receiptId = newId();
    const now = nowMs();

    this.db.transaction(() => {
      this.db
        .insert(goodsReceipt)
        .values({ id: receiptId, purchaseOrderId, receivedAt: now, notes: input.notes ?? null })
        .run();

      for (const line of input.lines) {
        const poLine = poLineById.get(line.poLineId)!;
        const product = this.db
          .select()
          .from(filamentProduct)
          .where(eq(filamentProduct.id, poLine.productId))
          .get();
        if (!product) throw new NotFoundError('Product');
        productIds.add(product.id);
        const outstanding = Math.max(
          0,
          poLine.quantityOrdered - this.po.receivedForLine(poLine.id),
        );
        const overDelivery = line.quantityReceived > outstanding;

        const grlId = newId();
        this.db
          .insert(goodsReceiptLine)
          .values({
            id: grlId,
            goodsReceiptId: receiptId,
            poLineId: line.poLineId,
            quantityReceived: line.quantityReceived,
            quantityDamaged: line.quantityDamaged,
            actualUnitPriceMinor: line.actualUnitPriceMinor ?? null,
            overDelivery: overDelivery ? 1 : 0,
            discrepancyNote: line.discrepancyNote ?? null,
          })
          .run();

        const netWeight = poLine.expectedWeightOverrideG ?? product.nominalNetWeightG;
        const unitPrice = line.actualUnitPriceMinor ?? poLine.unitPriceMinor;
        // Create one spool per received unit; damaged units are created archived (FR-207).
        for (let i = 0; i < line.quantityReceived; i++) {
          const damaged = i < line.quantityDamaged;
          const spoolId = newId();
          this.db
            .insert(spool)
            .values({
              id: spoolId,
              label: this.nextLabel(),
              productId: product.id,
              initialNetWeightG: netWeight,
              remainingNetWeightG: 0,
              tareWeightG:
                SPOOL_TYPE_TARE_DEFAULTS_G[(product.spoolType ?? 'plastic') as SpoolType],
              purchasePriceMinor: unitPrice,
              source: 'goods_reception',
              goodsReceiptLineId: grlId,
              status: damaged ? 'archived' : 'in_stock',
              acquiredAt: now,
              notes: damaged ? (line.discrepancyNote ?? 'Received damaged') : null,
            })
            .run();
          this.ledger.recordInitialInTx({ spoolId, initialWeightG: netWeight, note: 'Reception' });
          createdSpoolIds.push(spoolId);
        }
      }

      // Recompute PO status inside the transaction (FR-203).
      const newStatus = this.recomputeStatus(purchaseOrderId);
      if (newStatus !== poRow.status) {
        this.db
          .update(purchaseOrder)
          .set({ status: newStatus, updatedAt: now })
          .where(eq(purchaseOrder.id, purchaseOrderId))
          .run();
        this.po.recordStatusEvent(purchaseOrderId, poRow.status, newStatus);
      }
    });

    // Post-commit events (alerts re-eval + SSE).
    this.bus.publish({
      type: 'SpoolsReceivedIntoStock',
      receiptId,
      spoolIds: createdSpoolIds,
      productIds: [...productIds],
    });

    const finalStatus = this.recomputeStatus(purchaseOrderId);
    return {
      receipt: this.getReceipt(receiptId),
      createdSpoolIds,
      purchaseOrderStatus:
        finalStatus === 'received'
          ? 'received'
          : finalStatus === 'partially_received'
            ? 'partially_received'
            : 'ordered',
    };
  }

  private recomputeStatus(purchaseOrderId: string): 'ordered' | 'partially_received' | 'received' {
    const lines = this.db
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.purchaseOrderId, purchaseOrderId))
      .all();
    let totalOrdered = 0;
    let totalReceived = 0;
    for (const l of lines) {
      totalOrdered += l.quantityOrdered;
      totalReceived += this.po.receivedForLine(l.id);
    }
    if (totalReceived >= totalOrdered) return 'received';
    if (totalReceived > 0) return 'partially_received';
    return 'ordered';
  }

  list(purchaseOrderId: string): GoodsReceipt[] {
    return this.db
      .select()
      .from(goodsReceipt)
      .where(eq(goodsReceipt.purchaseOrderId, purchaseOrderId))
      .all()
      .map((r) => this.getReceipt(r.id));
  }

  getReceipt(id: string): GoodsReceipt {
    const r = this.db.select().from(goodsReceipt).where(eq(goodsReceipt.id, id)).get();
    if (!r) throw new NotFoundError('Goods receipt');
    const lines = this.db
      .select()
      .from(goodsReceiptLine)
      .where(eq(goodsReceiptLine.goodsReceiptId, id))
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
  }

  getReceiptDetail(id: string): GoodsReceiptDetail {
    const receipt = this.getReceipt(id);
    const grlIds = receipt.lines.map((l) => l.id);
    const createdSpools = this.db
      .select()
      .from(spool)
      .all()
      .filter((s) => s.goodsReceiptLineId != null && grlIds.includes(s.goodsReceiptLineId))
      .map((s) => this.spools.get(s.id));
    return { ...receipt, createdSpools };
  }
}
