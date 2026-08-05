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
  UsageStatus,
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

export interface FilamentProduct {
  id: string;
  material: Material;
  colorName: string;
  colorHex: string | null;
  vendorId: string;
  vendorName: string;
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
  cost: { totalCostMinor: number; incomplete: boolean } | null;
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
