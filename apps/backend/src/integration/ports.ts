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

export interface TaskRecord {
  bambuTaskId: string;
  printerSerial?: string;
  jobName?: string;
  startedAt?: number;
  endedAt?: number;
  durationMin?: number;
  outcome?: 'success' | 'failed' | 'cancelled' | 'unknown';
}

/** Driven port: cloud REST gateway. */
export interface BambuCloudGateway {
  login(email: string, password: string): Promise<LinkResult>;
  verifyCode(challengeId: string, code: string): Promise<LinkResult>;
  listDevices(accessToken: string): Promise<PrinterDescriptor[]>;
  fetchTasks(accessToken: string, sinceMs?: number): Promise<TaskRecord[]>;
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
