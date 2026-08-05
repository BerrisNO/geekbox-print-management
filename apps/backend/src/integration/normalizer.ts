import type { PrinterState, TelemetrySnapshot } from '@geekbox/shared';
import {
  bindResponseSchema,
  type RawBindResponse,
  type RawReportMessage,
  type RawTasksResponse,
  reportMessageSchema,
  tasksResponseSchema,
} from './bambu/raw-schemas.js';
import type { PrinterDescriptor, TaskRecord } from './ports.js';

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

  private noteMissing(field: string): void {
    if (!this.loggedFields.has(field)) {
      this.loggedFields.add(field);
      this.logOnce(`Bambu payload missing/unknown field: ${field}`);
    }
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
        return {
          bambuTaskId: String(t.id),
          printerSerial: t.deviceId ?? undefined,
          jobName: t.designTitle ?? t.title ?? '',
          startedAt: Number.isFinite(started) ? started : undefined,
          endedAt: Number.isFinite(ended) ? ended : undefined,
          durationMin: t.costTime != null ? t.costTime / 60 : undefined,
          outcome: mapTaskStatus(t.status),
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

function mapTaskStatus(status: string | number | null | undefined): TaskRecord['outcome'] {
  if (status == null) return 'unknown';
  const s = String(status).toUpperCase();
  if (s === '4' || s === 'SUCCESS' || s === 'FINISH') return 'success';
  if (s === '3' || s === 'FAILED') return 'failed';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  return 'unknown';
}

/** Bambu tray colors are hex with alpha (e.g. "RRGGBBAA"). Reduce to #RRGGBB. */
function normalizeColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const hex = color.replace(/^#/, '');
  if (hex.length >= 6) return `#${hex.slice(0, 6).toUpperCase()}`;
  return null;
}
