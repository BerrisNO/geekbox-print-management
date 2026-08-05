import {
  EXTERNAL_SLOT_INDEX,
  EXTERNAL_UNIT_INDEX,
  isExternalSlot,
  type Material,
  parseSlotRef,
  type SlotView,
  type SpoolSummary,
} from '@geekbox/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { printer, telemetrySnapshot } from '../../db/schema/integration.js';
import { amsSlotMapping, filamentProduct, spool } from '../../db/schema/inventory.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { newId, nowMs } from '../../shared/ids.js';

/**
 * AMS slot ↔ spool mapping (FR-305 amended, ADR-011). Owned by Inventory.
 * Every tracked printer has a virtual external holder at 254:0.
 */
export class AmsMappingService {
  constructor(private readonly db: Db) {}

  /** Build the SlotView list: physical AMS slots (from telemetry) + external holder. */
  listSlots(printerId: string): SlotView[] {
    const p = this.db.select().from(printer).where(eq(printer.id, printerId)).get();
    if (!p) throw new NotFoundError('Printer');

    const snap = this.db
      .select()
      .from(telemetrySnapshot)
      .where(eq(telemetrySnapshot.printerId, printerId))
      .get();
    const mappings = this.db
      .select()
      .from(amsSlotMapping)
      .where(eq(amsSlotMapping.printerId, printerId))
      .all();

    const views: SlotView[] = [];
    const seen = new Set<string>();

    // Physical slots observed via telemetry ams_json.
    if (snap?.amsJson) {
      try {
        const ams = JSON.parse(snap.amsJson) as {
          version: number;
          units: Array<{
            unitIndex: number;
            slots: Array<{
              slotIndex: number;
              trayType: string | null;
              trayColorHex: string | null;
              remainingPct: number | null;
            }>;
          }>;
        };
        for (const unit of ams.units) {
          for (const s of unit.slots) {
            const slotRef = `${unit.unitIndex}:${s.slotIndex}`;
            seen.add(slotRef);
            views.push(
              this.buildView(printerId, unit.unitIndex, s.slotIndex, mappings, {
                trayType: s.trayType,
                trayColorHex: s.trayColorHex,
                remainingPct: s.remainingPct,
              }),
            );
          }
        }
      } catch {
        // Malformed ams_json is ignored — external holder still shown.
      }
    }

    // Any mapped physical slots not present in telemetry (user-declared).
    for (const m of mappings) {
      if (isExternalSlot(m.unitIndex)) continue;
      const slotRef = `${m.unitIndex}:${m.slotIndex}`;
      if (!seen.has(slotRef)) {
        seen.add(slotRef);
        views.push(this.buildView(printerId, m.unitIndex, m.slotIndex, mappings, null));
      }
    }

    // Always append the virtual external holder (AC-305.4).
    views.push(this.buildView(printerId, EXTERNAL_UNIT_INDEX, EXTERNAL_SLOT_INDEX, mappings, null));

    return views;
  }

  private buildView(
    printerId: string,
    unitIndex: number,
    slotIndex: number,
    mappings: (typeof amsSlotMapping.$inferSelect)[],
    observation: SlotView['observation'],
  ): SlotView {
    const slotRef = `${unitIndex}:${slotIndex}`;
    const mapping = mappings.find((m) => m.unitIndex === unitIndex && m.slotIndex === slotIndex);
    let spoolSummary: SpoolSummary | null = null;
    if (mapping) {
      const s = this.db.select().from(spool).where(eq(spool.id, mapping.spoolId)).get();
      if (s) {
        const prod = this.db
          .select()
          .from(filamentProduct)
          .where(eq(filamentProduct.id, s.productId))
          .get();
        spoolSummary = {
          id: s.id,
          label: s.label,
          material: (prod?.material ?? 'OTHER') as Material,
          colorName: prod?.colorName ?? '',
          colorHex: prod?.colorHex ?? null,
          remainingNetWeightG: s.remainingNetWeightG,
          remainingPct:
            s.initialNetWeightG > 0 ? (s.remainingNetWeightG / s.initialNetWeightG) * 100 : 0,
          status: s.status as SpoolSummary['status'],
        };
      }
    }
    return {
      printerId,
      unitIndex,
      slotIndex,
      slotRef,
      external: unitIndex === EXTERNAL_UNIT_INDEX,
      observation,
      mapping: mapping
        ? {
            spoolId: mapping.spoolId,
            mappedAt: new Date(mapping.mappedAt).toISOString(),
            verifyFlag: mapping.verifyFlag === 1,
            verifyReason: (mapping.verifyReason ?? null) as
              | 'tray_mismatch'
              | 'spool_unavailable'
              | null,
          }
        : null,
      spool: spoolSummary,
    };
  }

  mapSlot(printerId: string, slotRef: string, spoolId: string): SlotView {
    const parsed = parseSlotRef(slotRef);
    if (!parsed) throw new ValidationError('Invalid slotRef');
    if (isExternalSlot(parsed.unitIndex) && parsed.slotIndex !== 0) {
      throw new ValidationError('External holder only has slot 0 (ADR-011)');
    }
    const s = this.db.select().from(spool).where(eq(spool.id, spoolId)).get();
    if (!s) throw new NotFoundError('Spool');
    if (s.status === 'depleted' || s.status === 'archived') {
      throw new ConflictError('SPOOL_UNAVAILABLE', 'Spool is depleted or archived');
    }
    // Spool can be mapped one place at a time (UNIQUE(spool_id)).
    const existingForSpool = this.db
      .select()
      .from(amsSlotMapping)
      .where(eq(amsSlotMapping.spoolId, spoolId))
      .get();
    if (existingForSpool) {
      throw new ConflictError('SPOOL_ALREADY_MAPPED', 'Spool is already mapped elsewhere');
    }

    this.db.transaction(() => {
      // Replace any existing mapping on this exact slot.
      this.db
        .delete(amsSlotMapping)
        .where(
          and(
            eq(amsSlotMapping.printerId, printerId),
            eq(amsSlotMapping.unitIndex, parsed.unitIndex),
            eq(amsSlotMapping.slotIndex, parsed.slotIndex),
          ),
        )
        .run();
      this.db
        .insert(amsSlotMapping)
        .values({
          id: newId(),
          printerId,
          unitIndex: parsed.unitIndex,
          slotIndex: parsed.slotIndex,
          spoolId,
          mappedAt: nowMs(),
          verifyFlag: 0,
          verifyReason: null,
        })
        .run();
      // Mapping sets spool in_use (AC-107.1).
      this.db.update(spool).set({ status: 'in_use' }).where(eq(spool.id, spoolId)).run();
    });

    return this.getSlotView(printerId, slotRef);
  }

  unmapSlot(printerId: string, slotRef: string): void {
    const parsed = parseSlotRef(slotRef);
    if (!parsed) throw new ValidationError('Invalid slotRef');
    const mapping = this.db
      .select()
      .from(amsSlotMapping)
      .where(
        and(
          eq(amsSlotMapping.printerId, printerId),
          eq(amsSlotMapping.unitIndex, parsed.unitIndex),
          eq(amsSlotMapping.slotIndex, parsed.slotIndex),
        ),
      )
      .get();
    if (!mapping) return;
    this.db.transaction(() => {
      this.db.delete(amsSlotMapping).where(eq(amsSlotMapping.id, mapping.id)).run();
      const s = this.db.select().from(spool).where(eq(spool.id, mapping.spoolId)).get();
      if (s && s.status !== 'depleted' && s.status !== 'archived') {
        this.db
          .update(spool)
          .set({ status: 'in_stock' })
          .where(eq(spool.id, mapping.spoolId))
          .run();
      }
    });
  }

  confirmMapping(printerId: string, slotRef: string): SlotView {
    const parsed = parseSlotRef(slotRef);
    if (!parsed) throw new ValidationError('Invalid slotRef');
    this.db
      .update(amsSlotMapping)
      .set({ verifyFlag: 0, verifyReason: null })
      .where(
        and(
          eq(amsSlotMapping.printerId, printerId),
          eq(amsSlotMapping.unitIndex, parsed.unitIndex),
          eq(amsSlotMapping.slotIndex, parsed.slotIndex),
        ),
      )
      .run();
    return this.getSlotView(printerId, slotRef);
  }

  /** Resolve the spool mapped to a printer's external holder (consumption attribution). */
  spoolForSlot(printerId: string, slotRef: string): string | null {
    const parsed = parseSlotRef(slotRef);
    if (!parsed) return null;
    const mapping = this.db
      .select()
      .from(amsSlotMapping)
      .where(
        and(
          eq(amsSlotMapping.printerId, printerId),
          eq(amsSlotMapping.unitIndex, parsed.unitIndex),
          eq(amsSlotMapping.slotIndex, parsed.slotIndex),
        ),
      )
      .get();
    return mapping?.spoolId ?? null;
  }

  private getSlotView(printerId: string, slotRef: string): SlotView {
    const view = this.listSlots(printerId).find((v) => v.slotRef === slotRef);
    if (!view) throw new NotFoundError('Slot');
    return view;
  }
}
