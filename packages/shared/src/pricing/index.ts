/**
 * Pure part-pricing helper shared by the backend (Part mapping) and the frontend
 * (live economics preview). All money is integer MINOR units (øre); rounding uses
 * Math.round, matching the costing service's roundMinor.
 */
import type { PartEconomics } from '../dto/index.js';

/** The subset of cost settings pricing needs. Nulls fall through to defaults/0. */
export interface PartPricingSettings {
  energyPricePerKwhMinor: number | null;
  machineRatePerHourMinor: number | null;
  laborRatePerHourMinor: number | null;
  defaultMarkupPct: number | null;
  defaultPowerDrawW: number | null;
}

/** A BOM line paired with its resolved filament price/weight for costing. */
export interface PartMaterialWithPrice {
  grams: number;
  /** filament_product.default_price_minor for this material. */
  defaultPriceMinor: number;
  /** filament_product.nominal_net_weight_g for this material. */
  nominalNetWeightG: number;
}

/** The part fields that drive pricing (subset of the Part DTO / input). */
export interface PartPricingInputs {
  printTimeMin: number | null;
  laborTimeMin: number | null;
  powerDrawW: number | null;
  markupPct: number | null;
  sellPriceMinor: number | null;
}

/**
 * Compute a part's economics from its BOM (with resolved filament prices) and the
 * cost settings. Mirrors the Stage-1 spec formula exactly. Reused verbatim by the
 * backend Part mapping and the frontend form preview.
 */
export function computePartEconomics(
  part: PartPricingInputs,
  materials: PartMaterialWithPrice[],
  settings: PartPricingSettings,
): PartEconomics {
  // Material cost: Σ grams × pricePerGram (0 when the filament has no weight).
  let materialAcc = 0;
  for (const m of materials) {
    const pricePerGram = m.nominalNetWeightG > 0 ? m.defaultPriceMinor / m.nominalNetWeightG : 0;
    materialAcc += m.grams * pricePerGram;
  }
  const materialCostMinor = Math.round(materialAcc);

  const printHours = (part.printTimeMin ?? 0) / 60;
  const laborHours = (part.laborTimeMin ?? 0) / 60;
  const powerW = part.powerDrawW ?? settings.defaultPowerDrawW ?? 0;
  const kWh = (powerW * printHours) / 1000;

  const energyCostMinor = Math.round(kWh * (settings.energyPricePerKwhMinor ?? 0));
  const machineCostMinor = Math.round(printHours * (settings.machineRatePerHourMinor ?? 0));
  const laborCostMinor = Math.round(laborHours * (settings.laborRatePerHourMinor ?? 0));

  const unitCostMinor = materialCostMinor + energyCostMinor + machineCostMinor + laborCostMinor;

  const markup = part.markupPct ?? settings.defaultMarkupPct ?? 0;
  const effectiveSellPriceMinor =
    part.sellPriceMinor != null
      ? part.sellPriceMinor
      : Math.round(unitCostMinor * (1 + markup / 100));

  const marginMinor = effectiveSellPriceMinor - unitCostMinor;
  const marginPct =
    effectiveSellPriceMinor > 0 ? Math.round((marginMinor / effectiveSellPriceMinor) * 100) : 0;

  return {
    materialCostMinor,
    energyCostMinor,
    machineCostMinor,
    laborCostMinor,
    unitCostMinor,
    effectiveSellPriceMinor,
    marginMinor,
    marginPct,
  };
}
