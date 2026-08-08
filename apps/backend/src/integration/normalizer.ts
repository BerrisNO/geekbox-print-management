import type { PrinterState, TelemetrySnapshot } from '@geekbox/shared';
import {
  bindResponseSchema,
  type RawBindResponse,
  type RawReportMessage,
  type RawTasksResponse,
  reportMessageSchema,
  tasksResponseSchema,
} from './bambu/raw-schemas.js';
import type { PrinterDescriptor, TaskRecord, TaskUsage } from './ports.js';

/**
 * The tolerant normalization boundary (NFR-MA-03, ES-303.1). Parses raw Bambu
 * payloads through Zod: unknown fields ignored; missing expected fields become
 * `unknown`/null with a once-per-field-per-session log; whole-payload parse
 * failures increment a drift counter and NEVER throw past the adapter (ES-301.2).
 *
 * This module produces ONLY internal types. No raw Bambu field name leaves here.
 */
export class Normalizer {
  private driftCounter = 0;
  private loggedFields = new Set<string>();

  constructor(private readonly logOnce: (msg: string) => void = () => {}) {}

  getDriftCounter(): number {
    return this.driftCounter;
  }

  /** Log a distinct observation once per session (dedupe key = full message). */
  private noteOnce(msg: string): void {
    if (!this.loggedFields.has(msg)) {
      this.loggedFields.add(msg);
      this.logOnce(msg);
    }
  }

  private noteMissing(field: string): void {
    this.noteOnce(`Bambu payload missing/unknown field: ${field}`);
  }

  /** Normalize a device-bind response into internal PrinterDescriptors. Never throws. */
  normalizeDevices(raw: unknown): PrinterDescriptor[] {
    const parsed = bindResponseSchema.safeParse(raw);
    if (!parsed.success) {
      this.driftCounter += 1;
      return [];
    }
    const data: RawBindResponse = parsed.data;
    const devices = data.devices ?? [];
    return devices
      .filter((d) => typeof d.dev_id === 'string' && d.dev_id.length > 0)
      .map((d) => ({
        serial: d.dev_id as string,
        name: d.name ?? d.dev_product_name ?? 'Printer',
        model: d.dev_model_name ?? null,
      }));
  }

  /** Normalize a tasks response into internal TaskRecords. Never throws. */
  normalizeTasks(raw: unknown): TaskRecord[] {
    const parsed = tasksResponseSchema.safeParse(raw);
    if (!parsed.success) {
      this.driftCounter += 1;
      return [];
    }
    const data: RawTasksResponse = parsed.data;
    const hits = data.hits ?? [];
    return hits
      .filter((t) => t.id != null)
      .map((t) => {
        const started = t.startTime ? Date.parse(t.startTime) : undefined;
        const ended = t.endTime ? Date.parse(t.endTime) : undefined;
        const usages = normalizeTaskUsages(t.amsDetailMapping, t.weight);
        const outcome = mapTaskStatus(t.status);
        // Ground-truth capture: the status enum is community-documented and has
        // already drifted once (real success code differed). Log each distinct
        // raw value with its mapping so server logs settle any future dispute.
        this.noteOnce(`Bambu task status observed: ${String(t.status)} → ${outcome}`);
        return {
          bambuTaskId: String(t.id),
          printerSerial: t.deviceId ?? undefined,
          jobName: t.designTitle ?? t.title ?? '',
          startedAt: Number.isFinite(started) ? started : undefined,
          endedAt: Number.isFinite(ended) ? ended : undefined,
          durationMin: t.costTime != null ? t.costTime / 60 : undefined,
          outcome,
          coverUrl: t.cover ?? undefined,
          totalWeightG: t.weight ?? undefined,
          totalLengthMm: t.length ?? undefined,
          bedType: t.bedType ?? undefined,
          plateIndex: t.plateIndex ?? undefined,
          usages,
        };
      });
  }

  /**
   * Normalize an MQTT report message into an internal telemetry snapshot (minus
   * printerId, which the caller supplies from the serial). Never throws; returns
   * null when the payload has no usable print block (drift-counted).
   */
  normalizeReport(raw: unknown, capturedAtMs: number): Omit<TelemetrySnapshot, 'printerId'> | null {
    const parsed = reportMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.driftCounter += 1;
      return null;
    }
    const data: RawReportMessage = parsed.data;
    const print = data.print;
    if (!print) {
      this.noteMissing('print');
      return null;
    }

    const ams = print.ams?.ams
      ? {
          version: 1 as const,
          units: print.ams.ams.map((u, unitIdx) => ({
            unitIndex: typeof u.id === 'number' ? u.id : unitIdx,
            humidityLevel: toBoundedInt(u.humidity, 1, 5),
            humidityPct: toBoundedInt(u.humidity_raw, 0, 100),
            slots: (u.tray ?? []).map((t, slotIdx) => ({
              slotIndex: typeof t.id === 'number' ? t.id : slotIdx,
              trayType: t.tray_type ?? null,
              trayColorHex: normalizeColor(t.tray_color),
              remainingPct: t.remain ?? null,
            })),
          })),
        }
      : null;

    return {
      capturedAt: new Date(capturedAtMs).toISOString(),
      printerState: mapGcodeState(print.gcode_state),
      taskName: print.subtask_name ?? null,
      progressPct: print.mc_percent ?? null,
      currentLayer: print.layer_num ?? null,
      totalLayers: print.total_layer_num ?? null,
      remainingTimeMin: print.mc_remaining_time ?? null,
      nozzleTempC: print.nozzle_temper ?? null,
      bedTempC: print.bed_temper ?? null,
      chamberTempC: print.chamber_temper ?? null,
      ams,
    };
  }
}

function mapGcodeState(state: string | null | undefined): PrinterState {
  switch ((state ?? '').toUpperCase()) {
    case 'IDLE':
    case 'FINISH':
      return 'idle';
    case 'RUNNING':
    case 'PREPARE':
    case 'SLICING':
      return 'printing';
    case 'PAUSE':
      return 'paused';
    case 'FAILED':
      return 'error';
    case 'OFFLINE':
      return 'offline';
    default:
      return 'unknown';
  }
}

/**
 * Task status → outcome. The enum is community-documented and drifted in the
 * wild: live accounts report completed prints as 2 (the documented 4 was never
 * observed but is kept). Distinct raw values are logged at the call site so the
 * server log shows ground truth if this drifts again.
 */
function mapTaskStatus(status: string | number | null | undefined): TaskRecord['outcome'] {
  if (status == null) return 'unknown';
  const s = String(status).toUpperCase();
  if (s === '2' || s === '4' || s === 'SUCCESS' || s === 'FINISH') return 'success';
  if (s === '3' || s === 'FAILED') return 'failed';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  return 'unknown';
}

/**
 * Convert a Bambu task's amsDetailMapping into internal per-slot usages. Maps the
 * global tray index → `unit:slot` slotRef. When no per-slot detail is present but a
 * total weight is, emits a single `"reported"` fallback usage so the total still
 * surfaces and stays attributable.
 */
function normalizeTaskUsages(
  mapping:
    | Array<{
        ams?: number | null;
        targetColor?: string | null;
        filamentType?: string | null;
        filamentId?: string | null;
        weight?: number | null;
      }>
    | null
    | undefined,
  totalWeightG: number | null | undefined,
): TaskUsage[] {
  const usages: TaskUsage[] = [];
  for (const m of mapping ?? []) {
    const slotRef = amsIndexToSlotRef(m.ams);
    if (!slotRef) continue;
    usages.push({
      slotRef,
      filamentType: m.filamentType ?? undefined,
      colorHex: normalizeColor(m.targetColor) ?? undefined,
      weightG: m.weight ?? undefined,
      filamentId: m.filamentId ?? undefined,
    });
  }
  if (usages.length === 0 && totalWeightG != null && totalWeightG > 0) {
    usages.push({ slotRef: 'reported', weightG: totalWeightG });
  }
  return usages;
}

/**
 * Bambu global tray index → app slotRef. 254 = external holder ("254:0"); otherwise
 * unit = floor(index/4), slot = index%4. Returns null for indices outside the
 * modeled range (units 0-3, slots 0-3), which the reconciler then skips.
 */
function amsIndexToSlotRef(ams: number | null | undefined): string | null {
  if (ams == null || !Number.isFinite(ams)) return null;
  if (ams === 254) return '254:0';
  if (ams < 0 || ams > 15) return null;
  const unit = Math.floor(ams / 4);
  const slot = ams % 4;
  return `${unit}:${slot}`;
}

/**
 * Coerce a string|number Bambu field to an integer within [min, max]; anything
 * unparsable or out of range becomes null (tolerant-normalization rule).
 */
function toBoundedInt(
  v: string | number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

/** Bambu tray colors are hex with alpha (e.g. "RRGGBBAA"). Reduce to #RRGGBB. */
function normalizeColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const hex = color.replace(/^#/, '');
  if (hex.length >= 6) return `#${hex.slice(0, 6).toUpperCase()}`;
  return null;
}
