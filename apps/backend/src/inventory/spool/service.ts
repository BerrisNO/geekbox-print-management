import type {
  LedgerEntry,
  Material,
  Spool,
  SpoolInput,
  SpoolPatch,
  SpoolStatus,
  SpoolType,
} from '@geekbox/shared';
import { SPOOL_TYPE_TARE_DEFAULTS_G } from '@geekbox/shared';
import { count, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { printer } from '../../db/schema/integration.js';
import {
  amsSlotMapping,
  filamentProduct,
  spool,
  spoolLedgerEntry,
  vendor,
} from '../../db/schema/inventory.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';
import { spoolValuationMinor } from '../../shared/money.js';
import type { LedgerWriter } from '../ledger/ledger-write.js';

export class SpoolService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerWriter,
  ) {}

  private nextLabel(): string {
    const n = this.db.select({ c: count() }).from(spool).get()?.c ?? 0;
    return `S-${String(n + 1).padStart(4, '0')}`;
  }

  list(filter: {
    productId?: string;
    material?: Material;
    status?: SpoolStatus;
    vendorId?: string;
  }): Spool[] {
    const rows = this.db.select().from(spool).all();
    return rows
      .filter((r) => !filter.productId || r.productId === filter.productId)
      .filter((r) => !filter.status || r.status === filter.status)
      .map((r) => this.toSpool(r))
      .filter((s) => !filter.material || s.product.material === filter.material)
      .filter((s) => !filter.vendorId || s.product.vendorId === filter.vendorId);
  }

  get(id: string): Spool {
    const row = this.db.select().from(spool).where(eq(spool.id, id)).get();
    if (!row) throw new NotFoundError('Spool');
    return this.toSpool(row);
  }

  getRaw(id: string): typeof spool.$inferSelect {
    const row = this.db.select().from(spool).where(eq(spool.id, id)).get();
    if (!row) throw new NotFoundError('Spool');
    return row;
  }

  register(input: SpoolInput): Spool {
    const product = this.db
      .select()
      .from(filamentProduct)
      .where(eq(filamentProduct.id, input.productId))
      .get();
    if (!product) throw new NotFoundError('Product');
    const id = newId();
    const acquiredAt = input.acquiredAt ? new Date(input.acquiredAt).getTime() : nowMs();
    // Default tare from the product's spool type when not explicitly provided
    // (overridable). Net-weight math is unaffected — tare is weigh-in metadata.
    const tareWeightG =
      input.tareWeightG ??
      SPOOL_TYPE_TARE_DEFAULTS_G[(product.spoolType ?? 'plastic') as SpoolType];
    this.db
      .insert(spool)
      .values({
        id,
        label: this.nextLabel(),
        productId: input.productId,
        initialNetWeightG: input.initialNetWeightG,
        remainingNetWeightG: 0, // set by the initial ledger entry
        tareWeightG,
        purchasePriceMinor: input.purchasePriceMinor ?? null,
        source: 'manual',
        goodsReceiptLineId: null,
        status: 'in_stock',
        acquiredAt,
        notes: input.notes ?? null,
      })
      .run();
    this.ledger.recordInitial({
      spoolId: id,
      initialWeightG: input.initialNetWeightG,
      note: 'Initial registration',
    });
    return this.get(id);
  }

  patch(id: string, input: SpoolPatch): Spool {
    this.getRaw(id);
    this.db
      .update(spool)
      .set({
        ...(input.tareWeightG !== undefined ? { tareWeightG: input.tareWeightG } : {}),
        ...(input.purchasePriceMinor !== undefined
          ? { purchasePriceMinor: input.purchasePriceMinor }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(eq(spool.id, id))
      .run();
    return this.get(id);
  }

  /** Recalibration (FR-104): gross - tare = net, or direct net. Posts a manual_adjustment. */
  adjust(
    id: string,
    args: { grossWeightG?: number; netWeightG?: number; note?: string },
  ): {
    spool: Spool;
    entry: LedgerEntry;
  } {
    const row = this.getRaw(id);
    let newNet: number;
    if (args.grossWeightG !== undefined) {
      if (row.tareWeightG == null) {
        throw new ValidationError('Gross weight requires a recorded tare weight on the spool');
      }
      newNet = args.grossWeightG - row.tareWeightG;
      if (newNet < 0)
        throw new ValidationError('Gross weight is less than the tare weight (ES-104.1)');
    } else if (args.netWeightG !== undefined) {
      newNet = args.netWeightG;
    } else {
      throw new ValidationError('Provide grossWeightG or netWeightG');
    }
    const { entryId } = this.ledger.manualAdjust({
      spoolId: id,
      newNetWeightG: newNet,
      ...(args.note !== undefined ? { note: args.note } : {}),
    });
    const entry = this.db
      .select()
      .from(spoolLedgerEntry)
      .where(eq(spoolLedgerEntry.id, entryId))
      .get()!;
    return { spool: this.get(id), entry: toLedgerEntry(entry) };
  }

  getLedger(id: string): LedgerEntry[] {
    this.getRaw(id);
    const rows = this.db
      .select()
      .from(spoolLedgerEntry)
      .where(eq(spoolLedgerEntry.spoolId, id))
      .all()
      .sort((a, b) => b.createdAt - a.createdAt);
    return rows.map(toLedgerEntry);
  }

  /** Lifecycle transition (FR-107). Archive-while-mapped = atomic unmap+archive (ES-107.1, ADR-011). */
  transitionStatus(id: string, status: SpoolStatus, confirmUnmap: boolean): Spool {
    const row = this.getRaw(id);
    const mapping = this.db
      .select()
      .from(amsSlotMapping)
      .where(eq(amsSlotMapping.spoolId, id))
      .get();

    if (status === 'archived' && mapping) {
      if (!confirmUnmap) {
        throw new ConflictError('SPOOL_MAPPED', 'Spool is mapped; confirm to unmap and archive');
      }
      this.db.transaction(() => {
        this.db.delete(amsSlotMapping).where(eq(amsSlotMapping.spoolId, id)).run();
        this.db.update(spool).set({ status: 'archived' }).where(eq(spool.id, id)).run();
      });
      return this.get(id);
    }

    // Guard illegal transitions minimally: cannot leave depleted except by adjust.
    if (row.status === 'depleted' && status === 'in_use') {
      throw new ConflictError(
        'SPOOL_DEPLETED',
        'Depleted spool cannot be set in_use without adjustment',
      );
    }
    this.db.update(spool).set({ status }).where(eq(spool.id, id)).run();
    return this.get(id);
  }

  private toSpool(r: typeof spool.$inferSelect): Spool {
    const product = this.db
      .select()
      .from(filamentProduct)
      .where(eq(filamentProduct.id, r.productId))
      .get();
    const v = product
      ? this.db
          .select({ name: vendor.name })
          .from(vendor)
          .where(eq(vendor.id, product.vendorId))
          .get()
      : undefined;
    const priceForValuation = r.purchasePriceMinor ?? product?.defaultPriceMinor ?? 0;
    const valuationEstimated = r.purchasePriceMinor == null;
    const mapping = this.db
      .select()
      .from(amsSlotMapping)
      .where(eq(amsSlotMapping.spoolId, r.id))
      .get();
    let mappedTo: Spool['mappedTo'] = null;
    if (mapping) {
      const p = this.db
        .select({ name: printer.name })
        .from(printer)
        .where(eq(printer.id, mapping.printerId))
        .get();
      mappedTo = {
        printerId: mapping.printerId,
        printerName: p?.name ?? '',
        slotRef: `${mapping.unitIndex}:${mapping.slotIndex}`,
      };
    }
    return {
      id: r.id,
      label: r.label,
      productId: r.productId,
      product: {
        material: (product?.material ?? 'OTHER') as Material,
        manufacturer: product?.manufacturer ?? null,
        name: product?.name ?? null,
        category: product?.category ?? null,
        spoolType: (product?.spoolType ?? 'plastic') as SpoolType,
        colorName: product?.colorName ?? '',
        colorHex: product?.colorHex ?? null,
        vendorId: product?.vendorId ?? '',
        vendorName: v?.name ?? '',
        diameterMm: product?.diameterMm ?? 1.75,
      },
      initialNetWeightG: r.initialNetWeightG,
      remainingNetWeightG: r.remainingNetWeightG,
      remainingPct:
        r.initialNetWeightG > 0 ? (r.remainingNetWeightG / r.initialNetWeightG) * 100 : 0,
      tareWeightG: r.tareWeightG,
      purchasePriceMinor: r.purchasePriceMinor,
      valuationMinor: spoolValuationMinor(
        priceForValuation,
        r.initialNetWeightG,
        r.remainingNetWeightG,
      ),
      valuationEstimated,
      source: r.source as 'goods_reception' | 'manual',
      goodsReceiptLineId: r.goodsReceiptLineId,
      status: r.status as SpoolStatus,
      mappedTo,
      acquiredAt: new Date(r.acquiredAt).toISOString(),
      notes: r.notes,
    };
  }
}

export function toLedgerEntry(r: typeof spoolLedgerEntry.$inferSelect): LedgerEntry {
  return {
    id: r.id,
    spoolId: r.spoolId,
    type: r.type as LedgerEntry['type'],
    deltaG: r.deltaG,
    balanceAfterG: r.balanceAfterG,
    jobId: r.jobId,
    slotRef: r.slotRef,
    reversesEntryId: r.reversesEntryId,
    estimated: r.estimated === 1,
    overConsumption: r.overConsumption === 1,
    note: r.note,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
