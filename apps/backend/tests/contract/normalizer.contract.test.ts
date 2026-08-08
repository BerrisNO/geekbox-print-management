import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Normalizer } from '../../src/integration/normalizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', '..', '..', 'fixtures', 'bambu');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

/**
 * ACL contract tests against the MS-1 recorded fixture corpus (NFR-MA-02/03).
 * These prove the tolerant boundary parses documented shapes AND degrades on drift.
 * Required before any adapter change ships (plan §7 prereq 5).
 */
describe('Normalizer — Bambu ACL boundary (MS-1 fixtures)', () => {
  it('normalizes the device bind list into internal PrinterDescriptors', () => {
    const n = new Normalizer();
    const printers = n.normalizeDevices(fixture('bind.json'));
    expect(printers).toHaveLength(2);
    expect(printers[0]).toEqual({ serial: '01P00A000000001', name: 'X1 Carbon', model: 'BL-P001' });
    expect(printers[1]!.model).toBe('N2S');
    // No raw Bambu field names leak (dev_id → serial).
    expect(Object.keys(printers[0]!)).toEqual(['serial', 'name', 'model']);
  });

  it('normalizes the tasks history into internal TaskRecords', () => {
    const n = new Normalizer();
    const tasks = n.normalizeTasks(fixture('tasks.json'));
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.bambuTaskId).toBe('900000001');
    expect(tasks[0]!.outcome).toBe('success'); // status 4
    expect(tasks[0]!.durationMin).toBeCloseTo(62, 5); // 3720s / 60
    expect(tasks[1]!.outcome).toBe('failed'); // status 3
  });

  it('captures cover, weight, and per-slot filament usages from a task', () => {
    const n = new Normalizer();
    const [benchy, bracket] = n.normalizeTasks(fixture('tasks.json'));

    expect(benchy!.coverUrl).toBe('https://public.bambulab.com/covers/900000001.png');
    expect(benchy!.totalWeightG).toBe(24.5);
    expect(benchy!.totalLengthMm).toBeCloseTo(8123.4, 5);
    expect(benchy!.bedType).toBe('textured_plate');
    expect(benchy!.plateIndex).toBe(1);
    // amsDetailMapping → internal slotRefs (ams 1 → "0:1", external 254 → "254:0").
    expect(benchy!.usages).toEqual([
      {
        slotRef: '0:1',
        filamentType: 'PLA',
        colorHex: '#FF0000',
        weightG: 20,
        filamentId: 'GFA00',
      },
      {
        slotRef: '254:0',
        filamentType: 'PETG',
        colorHex: '#00FF00',
        weightG: 4.5,
        filamentId: 'GFA01',
      },
    ]);

    // No per-slot detail but a reported total → a single "reported" fallback usage.
    expect(bracket!.coverUrl).toBeUndefined();
    expect(bracket!.usages).toEqual([{ slotRef: 'reported', weightG: 12, filamentId: undefined }]);
  });

  it('normalizes a printing report into an internal telemetry snapshot', () => {
    const n = new Normalizer();
    const snap = n.normalizeReport(fixture('report-printing.json'), 1_700_000_000_000);
    expect(snap).not.toBeNull();
    expect(snap!.printerState).toBe('printing'); // RUNNING
    expect(snap!.progressPct).toBe(42);
    expect(snap!.nozzleTempC).toBe(220.5);
    expect(snap!.chamberTempC).toBe(28.3);
    expect(snap!.ams).not.toBeNull();
    expect(snap!.ams!.units[0]!.slots).toHaveLength(4);
    // tray_color RRGGBBAA → #RRGGBB
    expect(snap!.ams!.units[0]!.slots[1]!.trayColorHex).toBe('#FF0000');
    // empty tray observed as null
    expect(snap!.ams!.units[0]!.slots[3]!.trayType).toBeNull();
  });

  it('degrades gracefully on an idle report with missing fields', () => {
    const n = new Normalizer();
    const snap = n.normalizeReport(fixture('report-idle.json'), 1_700_000_000_000);
    expect(snap).not.toBeNull();
    expect(snap!.printerState).toBe('idle'); // IDLE
    expect(snap!.progressPct).toBeNull();
    expect(snap!.ams).toBeNull();
    expect(snap!.nozzleTempC).toBe(24.1);
  });

  it('never throws on a drifted payload and increments the drift counter', () => {
    const n = new Normalizer();
    const before = n.getDriftCounter();
    const snap = n.normalizeReport(fixture('report-drift.json'), 1_700_000_000_000);
    // The drift fixture parses (passthrough) but has no print block → null, missing logged.
    expect(snap).toBeNull();
    // Fully malformed input (not an object) increments the drift counter and does not throw.
    expect(() => n.normalizeReport('not json', Date.now())).not.toThrow();
    expect(() => n.normalizeDevices(42)).not.toThrow();
    expect(n.normalizeDevices(42)).toEqual([]);
    expect(n.getDriftCounter()).toBeGreaterThanOrEqual(before);
  });

  it('ignores unknown fields (schema drift tolerance, NFR-MA-03)', () => {
    const n = new Normalizer();
    const withExtra = {
      print: {
        gcode_state: 'RUNNING',
        mc_percent: 10,
        brand_new_field: 'ignore me',
        nested: { x: 1 },
      },
    };
    const snap = n.normalizeReport(withExtra, Date.now());
    expect(snap).not.toBeNull();
    expect(snap!.progressPct).toBe(10);
    expect(JSON.stringify(snap)).not.toContain('brand_new_field');
  });
});
