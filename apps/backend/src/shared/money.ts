/**
 * Money is stored and computed in integer minor units (öre/cents). Costing keeps
 * full fractional precision in the inputs snapshot and rounds only at display.
 */

/** Round a fractional minor-unit amount to the nearest integer minor unit. */
export function roundMinor(amount: number): number {
  return Math.round(amount);
}

/**
 * Per-gram unit cost of a spool, in (fractional) minor units per gram.
 * Uses the spool's acquisition price over its initial net weight.
 */
export function unitCostPerGramMinor(priceMinor: number, initialWeightG: number): number {
  if (initialWeightG <= 0) return 0;
  return priceMinor / initialWeightG;
}

/**
 * Remaining-weight share valuation of a spool (FR-108): the fraction of the
 * acquisition price represented by the remaining weight.
 */
export function spoolValuationMinor(
  priceMinor: number,
  initialWeightG: number,
  remainingWeightG: number,
): number {
  if (initialWeightG <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, remainingWeightG / initialWeightG));
  return roundMinor(priceMinor * ratio);
}
