import type { TelemetrySnapshot } from '@geekbox/shared';

/**
 * ACL ports (ADR-006). These interfaces are the ONLY things the rest of the app
 * sees. Zero Bambu types cross this boundary (NFR-MA-02, enforced by
 * dependency-cruiser: nothing under integration/bambu/** may be imported from
 * outside integration/).
 */

export type LinkResult =
  | { kind: 'linked'; bambuUid: string; accessToken: string; refreshToken?: string }
  | { kind: 'code_required'; challengeId: string };

export interface PrinterDescriptor {
  serial: string;
  name: string;
  model: string | null;
}

/** Per-slot filament usage reported by a Bambu task, normalized to internal slotRefs. */
export interface TaskUsage {
  /** `unit:slot` (0-3 AMS units, 254 external) or `"reported"` when only a total is known. */
  slotRef: string;
  filamentType?: string;
  colorHex?: string;
  weightG?: number;
  /** Bambu filament catalog code, e.g. "GFA00". */
  filamentId?: string;
}

export interface TaskRecord {
  bambuTaskId: string;
  printerSerial?: string;
  jobName?: string;
  startedAt?: number;
  endedAt?: number;
  durationMin?: number;
  outcome?: 'success' | 'failed' | 'cancelled' | 'unknown';
  /** Signed cover image URL from Bambu (cached locally before display). */
  coverUrl?: string;
  /** Total filament weight (grams) reported for the task. */
  totalWeightG?: number;
  /** Total filament length (mm) reported for the task. */
  totalLengthMm?: number;
  /** Build plate type reported for the task (e.g. "textured_plate"). */
  bedType?: string;
  /** Plate number within the sliced project. */
  plateIndex?: number;
  /** Per-slot filament usage; empty when the task reports no filament detail. */
  usages?: TaskUsage[];
}

/** Driven port: cloud REST gateway. */
export interface BambuCloudGateway {
  login(email: string, password: string): Promise<LinkResult>;
  verifyCode(challengeId: string, code: string): Promise<LinkResult>;
  listDevices(accessToken: string): Promise<PrinterDescriptor[]>;
  fetchTasks(accessToken: string, sinceMs?: number): Promise<TaskRecord[]>;
  /** Numeric account uid, needed for the MQTT username u_{uid}. The access token
   * is opaque, so the uid is fetched from the authenticated preference endpoint. */
  getUserUid(accessToken: string): Promise<string>;
}

export type TelemetryEvent =
  | { kind: 'snapshot'; printerSerial: string; snapshot: Omit<TelemetrySnapshot, 'printerId'> }
  | { kind: 'connected' }
  | { kind: 'degraded'; detail: string }
  | { kind: 'reauth_required' }
  | { kind: 'drift'; field: string };

/** Driven port: live telemetry source (MQTT primary, REST-poll fallback). */
export interface TelemetrySource {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(handler: (event: TelemetryEvent) => void): void;
}

/** Driven port: encrypted token persistence (ADR-010). */
export interface TokenVault {
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}
