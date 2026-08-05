/**
 * Length ↔ mass conversion for length-reported filament usage (ES-402.1).
 * Filament is a cylinder: volume = length × π r². mass = volume × density.
 */

/** Convert a length in mm of filament to grams, given diameter (mm) and density (g/cm3). */
export function mmToGrams(lengthMm: number, diameterMm: number, densityGCm3: number): number {
  const radiusCm = diameterMm / 2 / 10; // mm -> cm
  const lengthCm = lengthMm / 10;
  const volumeCm3 = Math.PI * radiusCm * radiusCm * lengthCm;
  return volumeCm3 * densityGCm3;
}
