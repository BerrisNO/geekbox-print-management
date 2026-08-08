import type { TelemetrySnapshot } from '@geekbox/shared';

/**
 * Typed in-process publish/subscribe bus (ADR-001). Carries POST-COMMIT domain
 * notifications only — transactional side effects are direct same-tx calls.
 * The SSE broadcaster and alert evaluator subscribe here.
 */
export type DomainEvent =
  | { type: 'SpoolsReceivedIntoStock'; receiptId: string; spoolIds: string[]; productIds: string[] }
  | { type: 'StockLevelChanged'; productId: string; totalRemainingG: number; usableSpools: number }
  | {
      type: 'LowStockThresholdCrossed';
      productId: string;
      thresholdG: number | null;
      currentG: number;
      onOrderQty: number;
      earliestEta: string | null;
    }
  | { type: 'LowStockCleared'; productId: string }
  | { type: 'TelemetrySnapshotUpdated'; printerId: string; snapshot: TelemetrySnapshot }
  | {
      type: 'TrayContentsChanged';
      printerId: string;
      slotRef: string;
      observed: { trayType: string | null; trayColorHex: string | null };
    }
  | {
      type: 'MappingVerifyFlagged';
      printerId: string;
      slotRef: string;
      reason: 'tray_mismatch' | 'spool_unavailable';
    }
  | {
      type: 'FilamentConsumptionRecorded';
      jobId: string;
      spoolId: string;
      slotRef: string;
      grams: number;
      estimated: boolean;
      pending: boolean;
    }
  | {
      type: 'PrintJobCosted';
      jobId: string;
      costCalculationId: string;
      totalMinor: number;
      incomplete: boolean;
    }
  | {
      type: 'IntegrationStateChanged';
      state: 'connected' | 'degraded' | 'reauth_required' | 'disabled';
      detail: string;
      nextRetryAt: string | null;
    }
  | { type: 'PrintJobObserved'; jobId: string; kind: 'created' | 'merged' }
  /** Telemetry saw a print leave the printing state (finish/fail/cancel). */
  | { type: 'PrintFinishedObserved'; printerId: string };

export type EventType = DomainEvent['type'];
type Handler = (event: DomainEvent) => void;

export class EventBus {
  private handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Publish an event; handler exceptions are isolated so one bad subscriber cannot break others. */
  publish(event: DomainEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Swallow: post-commit notification delivery must not throw into the caller.
      }
    }
  }
}
