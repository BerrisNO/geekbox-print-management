import { describe, expect, it } from 'vitest';
import { roundMinor, spoolValuationMinor, unitCostPerGramMinor } from '../../src/shared/money.js';
import { mmToGrams } from '../../src/shared/units.js';

describe('units.mmToGrams (ES-402.1)', () => {
  it('converts length to mass via cylinder volume × density', () => {
    // 1000mm of 1.75mm PLA (1.24 g/cm3): r=0.0875cm, len=100cm
    // vol = pi*0.0875^2*100 = 2.4053 cm3; mass = 2.4053*1.24 = 2.982g
    const g = mmToGrams(1000, 1.75, 1.24);
    expect(g).toBeCloseTo(2.982, 2);
  });

  it('scales linearly with length', () => {
    expect(mmToGrams(2000, 1.75, 1.24)).toBeCloseTo(2 * mmToGrams(1000, 1.75, 1.24), 6);
  });

  it('is larger for thicker filament', () => {
    expect(mmToGrams(1000, 2.85, 1.24)).toBeGreaterThan(mmToGrams(1000, 1.75, 1.24));
  });
});

describe('money', () => {
  it('rounds to nearest minor unit', () => {
    expect(roundMinor(1234.4)).toBe(1234);
    expect(roundMinor(1234.5)).toBe(1235);
  });

  it('unit cost per gram = price / initial weight', () => {
    expect(unitCostPerGramMinor(25000, 1000)).toBe(25);
    expect(unitCostPerGramMinor(0, 1000)).toBe(0);
    expect(unitCostPerGramMinor(25000, 0)).toBe(0);
  });

  it('valuation is the remaining-weight share of price', () => {
    expect(spoolValuationMinor(25000, 1000, 500)).toBe(12500);
    expect(spoolValuationMinor(25000, 1000, 1000)).toBe(25000);
    expect(spoolValuationMinor(25000, 1000, 0)).toBe(0);
  });

  it('valuation clamps to [0, price]', () => {
    expect(spoolValuationMinor(25000, 1000, 2000)).toBe(25000);
    expect(spoolValuationMinor(25000, 1000, -50)).toBe(0);
  });
});
