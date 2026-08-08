/**
 * Wire DTOs — the API response contract (OpenAPI 3.1, api-contracts §A).
 * Authored once; the backend produces these shapes, the frontend consumes them.
 * Convention: every property is always present; nullable values are `T | null`,
 * never omitted (api-contracts M2 rule).
 */
import type {
  JobOutcome,
  LedgerEntryType,
  Material,
  PoStatus,
  PrinterState,
  SpoolStatus,
  SpoolType,
  UsageStatus,
  WorkOrderStatus,
} from '../constants/index.js';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  /** Field-level validation errors, keyed by field path. */
  errors?: Record<string, string[]>;
}

export interface SessionInfo {
  username: string;
  expiresAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
  leadTimeDays: number | null;
  archived: boolean;
}

export interface Manufacturer {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
  archived: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archived: boolean;
}

/** A single BOM line on a part: grams of a filament product. */
export interface PartMaterialLine {
  filamentProductId: string;
  /** Readable filament name, e.g. "eSUN PLA Blue" (manufacturer + material + color). */
  filamentLabel: string;
  grams: number;
}

/** Server-computed pricing breakdown for a part (all integer minor units). */
export interface PartEconomics {
  materialCostMinor: number;
  energyCostMinor: number;
  machineCostMinor: number;
  laborCostMinor: number;
  unitCostMinor: number;
  effectiveSellPriceMinor: number;
  marginMinor: number;
  /** Margin as a whole percent of the effective sell price. */
  marginPct: number;
}

export interface Part {
  id: string;
  articleNo: string;
  name: string;
  customerId: string | null;
  /** Customer display name, joined from `customer` (null when Universal/unset). */
  customerName: string | null;
  customerArticleNo: string | null;
  printTimeMin: number | null;
  laborTimeMin: number | null;
  powerDrawW: number | null;
  markupPct: number | null;
  sellPriceMinor: number | null;
  notes: string | null;
  archived: boolean;
  materials: PartMaterialLine[];
  economics: PartEconomics;
}

export interface FilamentProduct {
  id: string;
  material: Material;
  /** Manufacturer display name, joined from `manufacturer` (null when unset). */
  manufacturer: string | null;
  manufacturerId: string | null;
  name: string | null;
  category: string | null;
  spoolType: SpoolType;
  colorName: string;
  colorHex: string | null;
  vendorId: string;
  vendorName: string;
  /** All suppliers (primary + additional), for display; includes archived vendors. */
  vendors: { id: string; name: string }[];
  diameterMm: number;
  nominalNetWeightG: number;
  defaultPriceMinor: number;
  densityGCm3: number;
  lowStockThresholdG: number | null;
  lowStockMinSpools: number | null;
  sku: string | null;
  notes: string | null;
  archived: boolean;
}

export interface ProductDetail extends FilamentProduct {
  stock: ProductStockRow;
}

export interface SpoolMappedTo {
  printerId: string;
  printerName: string;
  slotRef: string;
}

export interface Spool {
  id: string;
  label: string;
  productId: string;
  product: {
    material: Material;
    manufacturer: string | null;
    name: string | null;
    category: string | null;
    spoolType: SpoolType;
    colorName: string;
    colorHex: string | null;
    vendorId: string;
    vendorName: string;
    diameterMm: number;
  };
  initialNetWeightG: number;
  remainingNetWeightG: number;
  remainingPct: number;
  tareWeightG: number | null;
  purchasePriceMinor: number | null;
  valuationMinor: number;
  valuationEstimated: boolean;
  source: 'goods_reception' | 'manual';
  goodsReceiptLineId: string | null;
  status: SpoolStatus;
  mappedTo: SpoolMappedTo | null;
  acquiredAt: string;
  notes: string | null;
}

export interface SpoolSummary {
  id: string;
  label: string;
  material: Material;
  colorName: string;
  colorHex: string | null;
  remainingNetWeightG: number;
  remainingPct: number;
  status: SpoolStatus;
}

export interface LedgerEntry {
  id: string;
  spoolId: string;
  type: LedgerEntryType;
  deltaG: number;
  balanceAfterG: number;
  jobId: string | null;
  slotRef: string | null;
  reversesEntryId: string | null;
  estimated: boolean;
  overConsumption: boolean;
  note: string | null;
  createdAt: string;
}

export interface AdjustResult {
  spool: Spool;
  entry: LedgerEntry;
}

export interface PurchaseOrderLine {
  id: string;
  productId: string;
  product: { material: Material; colorName: string; colorHex: string | null };
  quantityOrdered: number;
  unitPriceMinor: number;
  expectedWeightOverrideG: number | null;
  quantityReceived: number;
  quantityOutstanding: number;
}

export interface PoStatusEvent {
  id: string;
  fromStatus: string;
  toStatus: string;
  occurredAt: string;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  vendorName: string;
  status: PoStatus;
  orderDate: string;
  expectedArrival: string | null;
  externalRef: string | null;
  notes: string | null;
  shippingCostMinor: number | null;
  lines: PurchaseOrderLine[];
  totals: { quantityOrdered: number; quantityReceived: number; goodsValueMinor: number };
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  statusEvents: PoStatusEvent[];
  receipts: GoodsReceipt[];
}

// ---- work orders (Stage 2) ----
/** A print job linked to a work-order line (fulfillment rollup). */
export interface WorkOrderLinkedJob {
  id: string;
  jobName: string;
  outcome: JobOutcome;
  /** Job's total cost in minor units, or null when not yet costed/incomplete. */
  costMinor: number | null;
}

export interface WorkOrderLine {
  id: string;
  partId: string;
  partArticleNo: string;
  partName: string;
  quantity: number;
  /** Snapshot unit sell price (minor units) taken at write time. */
  unitPriceMinor: number;
  /** Snapshot unit cost (minor units) taken at write time. */
  unitCostMinor: number;
  /** quantity × unitPriceMinor. */
  lineSellMinor: number;
  /** quantity × unitCostMinor. */
  lineCostMinor: number;
  /** lineSellMinor − lineCostMinor. */
  lineMarginMinor: number;
  notes: string | null;
  /** Count of linked print jobs (fulfillment). */
  producedQty: number;
  /** Sum of linked jobs' costs (minor units); nulls skipped. */
  actualCostMinor: number;
  /** True when any linked job cost is missing or incomplete. */
  actualIncomplete: boolean;
  linkedJobs: WorkOrderLinkedJob[];
}

export interface WorkOrder {
  id: string;
  orderRef: string | null;
  customerId: string;
  customerName: string;
  orderDate: string | null;
  status: WorkOrderStatus;
  notes: string | null;
  archived: boolean;
  lineCount: number;
  totals: { sellMinor: number; costMinor: number; marginMinor: number; marginPct: number };
}

export interface WorkOrderDetail extends WorkOrder {
  lines: WorkOrderLine[];
}

export interface InboundRow {
  purchaseOrderId: string;
  vendorId: string;
  vendorName: string;
  status: 'ordered' | 'partially_received';
  expectedArrival: string | null;
  daysUntil: number | null;
  overdue: boolean;
  outstandingLines: Array<{
    poLineId: string;
    productId: string;
    material: Material;
    colorName: string;
    quantityOutstanding: number;
  }>;
  totalOutstandingQty: number;
  outstandingValueMinor: number;
}

export interface GoodsReceiptLine {
  id: string;
  poLineId: string;
  quantityReceived: number;
  quantityDamaged: number;
  actualUnitPriceMinor: number | null;
  overDelivery: boolean;
  discrepancyNote: string | null;
}

export interface GoodsReceipt {
  id: string;
  purchaseOrderId: string;
  receivedAt: string;
  notes: string | null;
  lines: GoodsReceiptLine[];
}

export interface GoodsReceiptDetail extends GoodsReceipt {
  createdSpools: Spool[];
}

export interface ReceptionResult {
  receipt: GoodsReceipt;
  createdSpoolIds: string[];
  purchaseOrderStatus: 'ordered' | 'partially_received' | 'received';
}

export interface ProductStockRow {
  productId: string;
  material: Material;
  colorName: string;
  colorHex: string | null;
  vendorId: string;
  vendorName: string;
  usableSpools: number;
  totalRemainingG: number;
  valuationMinor: number;
  valuationEstimated: boolean;
  lowStockActive: boolean;
}

export interface LowStockAlert {
  productId: string;
  material: Material;
  colorName: string;
  thresholdG: number | null;
  minSpools: number | null;
  currentRemainingG: number;
  currentUsableSpools: number;
  onOrderQty: number;
  earliestEta: string | null;
  activeSince: string;
}

export type ListenerState = 'running' | 'degraded' | 'stopped' | 'disabled';

export interface IntegrationStatus {
  state: 'unlinked' | 'linked' | 'reauth_required';
  enabled: boolean;
  authMode: 'password' | 'manual_token';
  bambuUid: string | null;
  mqttRegion: string;
  linkedAt: string | null;
  tokenIssuedAt: string | null;
  rest: { lastSuccessAt: string | null; lastErrorClass: string | null };
  mqtt: {
    listenerState: ListenerState;
    connectedSince: string | null;
    lastMessageAt: string | null;
    nextRetryAt: string | null;
  };
  driftCounter: number;
}

export interface LinkChallenge {
  state: 'code_required';
  challengeId: string;
}

export interface IntegrationSettings {
  enabled: boolean;
  mqttRegion: string;
  taskSyncIntervalMin: number;
}

export interface Printer {
  id: string;
  serial: string;
  name: string;
  model: string | null;
  registration: 'discovered' | 'manual';
  tracked: boolean;
  online: boolean;
  lastSeenAt: string | null;
}

export interface TrayObservation {
  trayType: string | null;
  trayColorHex: string | null;
  remainingPct: number | null;
}

export interface AmsUnit {
  unitIndex: number;
  slots: Array<{
    slotIndex: number;
    trayType: string | null;
    trayColorHex: string | null;
    remainingPct: number | null;
  }>;
}

export interface TelemetrySnapshot {
  printerId: string;
  capturedAt: string;
  printerState: PrinterState;
  taskName: string | null;
  progressPct: number | null;
  currentLayer: number | null;
  totalLayers: number | null;
  remainingTimeMin: number | null;
  nozzleTempC: number | null;
  bedTempC: number | null;
  chamberTempC: number | null;
  ams: { version: 1; units: AmsUnit[] } | null;
}

export interface SlotView {
  printerId: string;
  unitIndex: number;
  slotIndex: number;
  slotRef: string;
  external: boolean;
  observation: TrayObservation | null;
  mapping: {
    spoolId: string;
    mappedAt: string;
    verifyFlag: boolean;
    verifyReason: 'tray_mismatch' | 'spool_unavailable' | null;
  } | null;
  spool: SpoolSummary | null;
}

export interface FilamentUsage {
  id: string;
  jobId: string;
  slotRef: string;
  spoolId: string | null;
  spoolLabel: string | null;
  usedG: number | null;
  usedMm: number | null;
  /** Bambu-reported filament type for this slot (e.g. "PLA"), null for manual usages. */
  trayType: string | null;
  /** Bambu-reported loaded color as #RRGGBB, null when unknown. */
  colorHex: string | null;
  /** Bambu filament catalog code (e.g. "GFA00"), null when unknown. */
  filamentId: string | null;
  /** Spool currently mapped to this slot's printer (live suggestion), when unattributed. */
  suggestedSpoolId: string | null;
  suggestedSpoolLabel: string | null;
  estimated: boolean;
  attributed: boolean;
  ledgerEntryId: string | null;
}

export interface CostBreakdownInputs {
  perSpool: Array<{
    spoolId: string;
    grams: number;
    unitCostPerGMinor: number;
    estimated: boolean;
  }>;
  energyPricePerKwhMinor: number | null;
  machineRatePerHourMinor: number | null;
  watts: number | null;
  durationMin: number | null;
}

export interface CostBreakdown {
  id: string;
  jobId: string;
  calculatedAt: string;
  filamentCostMinor: number;
  energyCostMinor: number | null;
  machineCostMinor: number | null;
  totalCostMinor: number;
  incomplete: boolean;
  superseded: boolean;
  currencyCode: string;
  inputs: CostBreakdownInputs;
}

export interface PrintJob {
  id: string;
  source: 'task_sync' | 'telemetry' | 'manual';
  bambuTaskId: string | null;
  printerId: string | null;
  printerName: string | null;
  jobName: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMin: number | null;
  outcome: JobOutcome;
  usageStatus: UsageStatus;
  totalUsedG: number;
  /** Bambu-reported total filament weight (g) for the task, null when unknown. */
  totalWeightG: number | null;
  /** Bambu-reported total filament length (mm) for the task, null when unknown. */
  totalLengthMm: number | null;
  /** Build plate type reported by Bambu (e.g. "textured_plate"), null when unknown. */
  bedType: string | null;
  /** Plate number within the sliced project, null when unknown. */
  plateIndex: number | null;
  /** App-relative cover image URL (/api/jobs/{id}/cover) when cached, else null. */
  coverUrl: string | null;
  /** Per-slot filament summary for list rendering (color chips + link state). */
  usageSummary: Array<{
    trayType: string | null;
    colorHex: string | null;
    usedG: number | null;
    attributed: boolean;
  }>;
  /** Count of usages with weight that still lack a confirmed spool link. */
  unattributedCount: number;
  cost: { totalCostMinor: number; incomplete: boolean } | null;
  /** The work-order line this job fulfills, or null when unassigned. */
  workOrderLineId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrintJobDetail extends PrintJob {
  usages: FilamentUsage[];
  costBreakdown: CostBreakdown | null;
}

export interface JobsSummary {
  count: number;
  successCount: number;
  successRatePct: number;
  totalUsedG: number;
  totalCostMinor: number;
  incompleteCostCount: number;
}

export interface JobListResponse {
  jobs: PrintJob[];
  summary: JobsSummary;
}

export interface AttributeResult {
  usage: FilamentUsage;
  entry: LedgerEntry;
}

export interface SyncResult {
  fetched: number;
  created: number;
  merged: number;
}

export interface CostRateSettings {
  energyPricePerKwhMinor: number | null;
  machineRatePerHourMinor: number | null;
  laborRatePerHourMinor: number | null;
  defaultMarkupPct: number | null;
  defaultPowerDrawW: number | null;
  currencyCode: string;
  printerPowerDraw: Array<{ printerId: string; printerName: string; watts: number }>;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  components: {
    db: { writable: boolean };
    integration: { listenerState: ListenerState; lastMqttMessageAgeSec: number | null };
  };
}

// ---- SSE messages (api-contracts Part C) ----
export type SseMessage =
  | { type: 'telemetry'; printerId: string; snapshot: TelemetrySnapshot; capturedAt: string }
  | {
      type: 'integrationStatus';
      state: 'connected' | 'degraded' | 'reauth_required' | 'disabled';
      detail: string;
      nextRetryAt: string | null;
    }
  | {
      type: 'lowStock';
      productId: string;
      active: boolean;
      currentG: number;
      thresholdG: number | null;
      onOrderQty: number;
      earliestEta: string | null;
    }
  | {
      type: 'mappingVerify';
      printerId: string;
      slotRef: string;
      reason: 'tray_mismatch' | 'spool_unavailable';
    }
  | {
      type: 'jobUpdate';
      jobId: string;
      kind: 'created' | 'merged' | 'consumption_posted' | 'consumption_pending' | 'costed';
    };
