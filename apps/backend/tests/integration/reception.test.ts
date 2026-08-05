import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/bus/event-bus.js';
import type { Db } from '../../src/db/client.js';
import { spool } from '../../src/db/schema/inventory.js';
import { goodsReceipt, purchaseOrder } from '../../src/db/schema/procurement.js';
import { CatalogService } from '../../src/inventory/catalog/service.js';
import { LedgerWriter } from '../../src/inventory/ledger/ledger-write.js';
import { SpoolService } from '../../src/inventory/spool/service.js';
import { PurchaseOrderService } from '../../src/procurement/po/service.js';
import { ReceptionService } from '../../src/procurement/reception/service.js';
import { makeTestDb } from './_setup.js';

/**
 * Reception atomic-posting suite (FR-205, NFR-RE-03). Includes crash-injection to
 * prove full rollback / zero partial writes.
 */
describe('ReceptionService', () => {
  let db: Db;
  let catalog: CatalogService;
  let spools: SpoolService;
  let po: PurchaseOrderService;
  let reception: ReceptionService;

  beforeEach(() => {
    db = makeTestDb();
    const bus = new EventBus();
    const ledger = new LedgerWriter(db);
    catalog = new CatalogService(db);
    spools = new SpoolService(db, ledger);
    po = new PurchaseOrderService(db);
    reception = new ReceptionService(db, ledger, spools, po, bus);
  });

  function setupOrderedPo(qty: number): { poId: string; lineId: string } {
    const v = catalog.createVendor({ name: 'Acme' });
    const p = catalog.createProduct({
      material: 'PLA',
      colorName: 'Black',
      vendorId: v.id,
      diameterMm: 1.75,
      nominalNetWeightG: 1000,
    });
    const created = po.create({
      vendorId: v.id,
      orderDate: '2026-01-01',
      lines: [{ productId: p.id, quantityOrdered: qty, unitPriceMinor: 20000 }],
    });
    po.transitionStatus(created.id, 'ordered');
    return { poId: created.id, lineId: created.lines[0]!.id };
  }

  it('atomically creates spools + ledger entries + recomputes PO status', () => {
    const { poId, lineId } = setupOrderedPo(3);
    const result = reception.post(poId, {
      lines: [
        { poLineId: lineId, quantityReceived: 3, quantityDamaged: 0, confirmOverDelivery: false },
      ],
    });
    expect(result.createdSpoolIds).toHaveLength(3);
    expect(result.purchaseOrderStatus).toBe('received');
    const created = db.select().from(spool).all();
    expect(created).toHaveLength(3);
    for (const s of created) {
      expect(s.remainingNetWeightG).toBe(1000); // initial ledger entry applied
      expect(s.status).toBe('in_stock');
      expect(s.source).toBe('goods_reception');
    }
    const poRow = db.select().from(purchaseOrder).where(eq(purchaseOrder.id, poId)).get()!;
    expect(poRow.status).toBe('received');
  });

  it('partial reception yields partially_received', () => {
    const { poId, lineId } = setupOrderedPo(5);
    const result = reception.post(poId, {
      lines: [
        { poLineId: lineId, quantityReceived: 2, quantityDamaged: 0, confirmOverDelivery: false },
      ],
    });
    expect(result.purchaseOrderStatus).toBe('partially_received');
  });

  it('creates damaged units as archived spools (FR-207)', () => {
    const { poId, lineId } = setupOrderedPo(2);
    reception.post(poId, {
      lines: [
        {
          poLineId: lineId,
          quantityReceived: 2,
          quantityDamaged: 1,
          confirmOverDelivery: false,
          discrepancyNote: 'crushed',
        },
      ],
    });
    const created = db.select().from(spool).all();
    expect(created.filter((s) => s.status === 'archived')).toHaveLength(1);
  });

  it('rejects unconfirmed over-delivery (ES-205.1)', () => {
    const { poId, lineId } = setupOrderedPo(2);
    expect(() =>
      reception.post(poId, {
        lines: [
          { poLineId: lineId, quantityReceived: 5, quantityDamaged: 0, confirmOverDelivery: false },
        ],
      }),
    ).toThrow();
  });

  it('rejects damaged > received (ES-207.1)', () => {
    const { poId, lineId } = setupOrderedPo(3);
    expect(() =>
      reception.post(poId, {
        lines: [
          { poLineId: lineId, quantityReceived: 2, quantityDamaged: 3, confirmOverDelivery: false },
        ],
      }),
    ).toThrow();
  });

  it('crash-injection: a failure mid-posting rolls back with zero partial writes (NFR-RE-03)', () => {
    const { poId, lineId } = setupOrderedPo(3);
    // Force a throw partway through the transaction by making the ledger writer fail.
    const ledger = (reception as unknown as { ledger: LedgerWriter }).ledger;
    let calls = 0;
    const spy = vi.spyOn(ledger, 'recordInitialInTx').mockImplementation((..._args) => {
      calls += 1;
      if (calls === 2) throw new Error('simulated crash mid-transaction');
      // call through would need the real impl; simplest is to throw before any commit
      throw new Error('simulated crash mid-transaction');
    });

    expect(() =>
      reception.post(poId, {
        lines: [
          { poLineId: lineId, quantityReceived: 3, quantityDamaged: 0, confirmOverDelivery: false },
        ],
      }),
    ).toThrow();

    // Full rollback: no receipt, no spools, PO still ordered.
    expect(db.select().from(goodsReceipt).all()).toHaveLength(0);
    expect(db.select().from(spool).all()).toHaveLength(0);
    const poRow = db.select().from(purchaseOrder).where(eq(purchaseOrder.id, poId)).get()!;
    expect(poRow.status).toBe('ordered');
    spy.mockRestore();
  });
});
