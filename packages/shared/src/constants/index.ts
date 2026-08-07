/**
 * Cross-cutting constants shared by backend and frontend.
 */

/** Material enum — mirrors filament_product.material CHECK (data-model §3). */
export const MATERIALS = [
  'PLA',
  'PETG',
  'ABS',
  'TPU',
  'ASA',
  'PC',
  'PA',
  'SUPPORT',
  'OTHER',
] as const;
export type Material = (typeof MATERIALS)[number];

/** Seeded density defaults (g/cm3) per material — documented per FR-402 / ES-402.1. */
export const DENSITY_DEFAULTS_G_CM3: Record<Material, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  TPU: 1.21,
  ASA: 1.07,
  PC: 1.2,
  PA: 1.14,
  SUPPORT: 1.2,
  OTHER: 1.2,
};

export const SPOOL_STATUSES = ['in_stock', 'in_use', 'depleted', 'archived'] as const;
export type SpoolStatus = (typeof SPOOL_STATUSES)[number];

export const SPOOL_TYPES = ['plastic', 'cardboard', 'refill', 'reusable'] as const;
export type SpoolType = (typeof SPOOL_TYPES)[number];

/** Default empty-spool (tare) weight in grams per spool type; user-overridable per spool. */
export const SPOOL_TYPE_TARE_DEFAULTS_G: Record<SpoolType, number> = {
  plastic: 200,
  cardboard: 55,
  refill: 0,
  reusable: 250,
};

export const PO_STATUSES = [
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const WORK_ORDER_STATUSES = [
  'draft',
  'confirmed',
  'in_production',
  'completed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const PRINTER_STATES = [
  'idle',
  'printing',
  'paused',
  'error',
  'offline',
  'unknown',
] as const;
export type PrinterState = (typeof PRINTER_STATES)[number];

export const JOB_OUTCOMES = ['success', 'failed', 'cancelled', 'unknown'] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];

export const USAGE_STATUSES = ['reported', 'estimated', 'unknown', 'manual'] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = [
  'initial',
  'consumption',
  'manual_adjustment',
  'reversal',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Diameters allowed (mm) — data-model §3. */
export const DIAMETERS_MM = [1.75, 2.85] as const;

/** Reserved virtual external-spool holder address (ADR-011). */
export const EXTERNAL_UNIT_INDEX = 254;
export const EXTERNAL_SLOT_INDEX = 0;
export const EXTERNAL_SLOT_REF = '254:0';

/** Format a (unit, slot) pair into the canonical slotRef string. */
export function formatSlotRef(unitIndex: number, slotIndex: number): string {
  return `${unitIndex}:${slotIndex}`;
}

/** Parse a slotRef string into its numeric components. Returns null when malformed. */
export function parseSlotRef(slotRef: string): { unitIndex: number; slotIndex: number } | null {
  const parts = slotRef.split(':');
  if (parts.length !== 2) return null;
  const unitIndex = Number(parts[0]);
  const slotIndex = Number(parts[1]);
  if (!Number.isInteger(unitIndex) || !Number.isInteger(slotIndex)) return null;
  return { unitIndex, slotIndex };
}

export function isExternalSlot(unitIndex: number): boolean {
  return unitIndex === EXTERNAL_UNIT_INDEX;
}

/** Default currency (display-only, disclosed assumption pending Q-03). */
export const DEFAULT_CURRENCY_CODE = 'NOK';

/** List pagination defaults (API contract cross-cutting rules). */
export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 500;

export const MQTT_REGIONS = ['us', 'eu', 'cn'] as const;
