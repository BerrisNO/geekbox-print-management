import { z } from 'zod';
import { DIAMETERS_MM, JOB_OUTCOMES, MATERIALS, SPOOL_STATUSES } from '../constants/index.js';

/**
 * Zod v4 input schemas shared by the API boundary (Fastify) and frontend forms
 * (TanStack Form). Authored once; one validation idiom everywhere (ADR-002).
 *
 * These validate REQUEST payloads. Response DTO shapes are owned by the backend
 * (it assembles derived/computed fields); the frontend consumes them as inferred
 * types from the OpenAPI contract.
 */

export const materialSchema = z.enum(MATERIALS);
export const spoolStatusSchema = z.enum(SPOOL_STATUSES);
export const jobOutcomeSchema = z.enum(JOB_OUTCOMES);

const uuid = z.string().uuid();
const colorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a #RRGGBB hex color');

// ---- auth ----
export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});
export type CredentialsInput = z.infer<typeof credentialsSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---- vendors ----
// URL accepts a bare domain (e.g. "prusa.com") and normalizes it to a full URL by
// prepending https:// — users don't type the scheme. Empty/whitespace → omitted.
const vendorUrl = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}, z.string().url().optional());

export const vendorInputSchema = z.object({
  name: z.string().min(1),
  url: vendorUrl,
  leadTimeDays: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});
export type VendorInput = z.infer<typeof vendorInputSchema>;

// ---- products ----
export const productInputSchema = z.object({
  material: materialSchema,
  colorName: z.string().min(1),
  colorHex: colorHex.optional(),
  vendorId: uuid,
  diameterMm: z
    .number()
    .refine((v) => (DIAMETERS_MM as readonly number[]).includes(v), {
      message: 'Diameter must be 1.75 or 2.85 mm',
    })
    .default(1.75),
  nominalNetWeightG: z.number().int().positive(),
  defaultPriceMinor: z.number().int().min(0).optional(),
  densityGCm3: z.number().positive().optional(),
  lowStockThresholdG: z.number().int().min(0).optional(),
  lowStockMinSpools: z.number().int().min(0).optional(),
  sku: z.string().optional(),
  notes: z.string().optional(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

// ---- spools ----
export const spoolInputSchema = z.object({
  productId: uuid,
  initialNetWeightG: z.number().int().positive().max(20000),
  tareWeightG: z.number().int().min(0).optional(),
  purchasePriceMinor: z.number().int().min(0).optional(),
  acquiredAt: z.string().optional(),
  notes: z.string().optional(),
});
export type SpoolInput = z.infer<typeof spoolInputSchema>;

export const spoolPatchSchema = z.object({
  tareWeightG: z.number().int().min(0).optional(),
  purchasePriceMinor: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});
export type SpoolPatch = z.infer<typeof spoolPatchSchema>;

export const spoolAdjustSchema = z
  .object({
    grossWeightG: z.number().positive().optional(),
    netWeightG: z.number().min(0).optional(),
    note: z.string().optional(),
  })
  .refine((v) => v.grossWeightG !== undefined || v.netWeightG !== undefined, {
    message: 'Provide grossWeightG or netWeightG',
  });
export type SpoolAdjustInput = z.infer<typeof spoolAdjustSchema>;

export const spoolStatusTransitionSchema = z.object({
  status: spoolStatusSchema,
  confirmUnmap: z.boolean().default(false),
});
export type SpoolStatusTransitionInput = z.infer<typeof spoolStatusTransitionSchema>;

// ---- purchase orders ----
export const purchaseOrderLineInputSchema = z.object({
  productId: uuid,
  quantityOrdered: z.number().int().min(1),
  unitPriceMinor: z.number().int().min(0),
  expectedWeightOverrideG: z.number().int().positive().optional(),
});
export const purchaseOrderInputSchema = z.object({
  vendorId: uuid,
  orderDate: z.string(),
  expectedArrival: z.string().optional(),
  externalRef: z.string().optional(),
  shippingCostMinor: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;

export const purchaseOrderPatchSchema = z.object({
  expectedArrival: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1).optional(),
});
export type PurchaseOrderPatch = z.infer<typeof purchaseOrderPatchSchema>;

export const poStatusTransitionSchema = z.object({
  status: z.enum(['ordered', 'cancelled']),
});
export type PoStatusTransitionInput = z.infer<typeof poStatusTransitionSchema>;

// ---- receptions ----
export const receptionLineInputSchema = z.object({
  poLineId: uuid,
  quantityReceived: z.number().int().min(1),
  quantityDamaged: z.number().int().min(0).default(0),
  actualUnitPriceMinor: z.number().int().min(0).optional(),
  confirmOverDelivery: z.boolean().default(false),
  discrepancyNote: z.string().optional(),
});
export const receptionInputSchema = z.object({
  notes: z.string().optional(),
  lines: z.array(receptionLineInputSchema).min(1),
});
export type ReceptionInput = z.infer<typeof receptionInputSchema>;

// ---- integration ----
export const linkAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LinkAccountInput = z.infer<typeof linkAccountSchema>;

export const verifyLinkSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(1),
});
export type VerifyLinkInput = z.infer<typeof verifyLinkSchema>;

export const manualTokenSchema = z.object({
  bambuUid: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
});
export type ManualTokenInput = z.infer<typeof manualTokenSchema>;

/**
 * MQTT region: one of the known short codes, or a full hostname under the Bambu
 * MQTT domain. Rejecting arbitrary hosts at the boundary is the first layer of the
 * SSRF/token-exfil defense (MR-001); the adapter re-validates at the sink.
 */
const mqttRegionSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (v) => {
      const value = v.trim().toLowerCase();
      if (value === 'us' || value === 'eu' || value === 'cn') return true;
      return (
        /^[a-z0-9.-]+$/.test(value) &&
        !value.includes('@') &&
        (value === 'mqtt.bambulab.com' || value.endsWith('.mqtt.bambulab.com'))
      );
    },
    { message: 'mqttRegion must be us, eu, cn, or a *.mqtt.bambulab.com hostname' },
  );

export const integrationSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  mqttRegion: mqttRegionSchema.optional(),
  taskSyncIntervalMin: z.number().int().min(30).optional(),
});
export type IntegrationSettingsPatch = z.infer<typeof integrationSettingsPatchSchema>;

// ---- printers & AMS ----
export const registerPrinterSchema = z.object({
  serial: z.string().min(1),
  name: z.string().min(1),
  model: z.string().optional(),
});
export type RegisterPrinterInput = z.infer<typeof registerPrinterSchema>;

export const updatePrinterSchema = z.object({
  tracked: z.boolean().optional(),
  name: z.string().min(1).optional(),
});
export type UpdatePrinterInput = z.infer<typeof updatePrinterSchema>;

export const mapSlotSchema = z.object({ spoolId: uuid });
export type MapSlotInput = z.infer<typeof mapSlotSchema>;

/** slotRef path param: unitIndex 0-3 (AMS) or 254 (external), slotIndex 0-3. */
export const slotRefSchema = z.string().regex(/^([0-3]|254):[0-3]$/);

// ---- jobs & costing ----
export const manualJobUsageSchema = z.object({
  spoolId: uuid.optional(),
  usedG: z.number().positive(),
});
export const manualJobInputSchema = z.object({
  printerId: uuid.optional(),
  jobName: z.string().min(1),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMin: z.number().min(0).optional(),
  outcome: jobOutcomeSchema,
  usages: z.array(manualJobUsageSchema).optional(),
});
export type ManualJobInput = z.infer<typeof manualJobInputSchema>;

export const jobCorrectionUsageSchema = z.object({
  usageId: z.string().optional(),
  spoolId: uuid.optional(),
  usedG: z.number().positive().optional(),
  confirmArchivedSpool: z.boolean().optional(),
});
export const jobCorrectionSchema = z.object({
  durationMin: z.number().min(0).optional(),
  outcome: jobOutcomeSchema.optional(),
  usages: z.array(jobCorrectionUsageSchema).optional(),
});
export type JobCorrectionInput = z.infer<typeof jobCorrectionSchema>;

export const attributeUsageSchema = z.object({ spoolId: uuid });
export type AttributeUsageInput = z.infer<typeof attributeUsageSchema>;

export const costRatesInputSchema = z.object({
  energyPricePerKwhMinor: z.number().int().min(0).nullable().optional(),
  machineRatePerHourMinor: z.number().int().min(0).nullable().optional(),
  currencyCode: z.string().length(3).optional(),
  printerPowerDraw: z.array(z.object({ printerId: uuid, watts: z.number().positive() })).optional(),
});
export type CostRatesInput = z.infer<typeof costRatesInputSchema>;
