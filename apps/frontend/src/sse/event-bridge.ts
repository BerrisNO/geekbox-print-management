import type { SseMessage, TelemetrySnapshot } from '@geekbox/shared';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/query-keys';
import { useUiStore } from '../stores/ui-store';

/**
 * Single EventSource('/api/events') (ADR-005). Dispatches the 5 SseMessage types
 * to react-query invalidate/setQueryData. On 2 consecutive connection failures it
 * flips telemetry + integration-status queries to a 10s refetchInterval poll and
 * surfaces a "live updates degraded — polling" indicator; on recovery it stops
 * polling. Same query keys / payload schema — no divergent render path.
 */

const FAILURE_THRESHOLD = 2;
const POLL_INTERVAL_MS = 10_000;

export interface EventBridge {
  close(): void;
}

export function startEventBridge(qc: QueryClient): EventBridge {
  let source: EventSource | null = null;
  let consecutiveFailures = 0;
  let polling = false;
  let closed = false;

  const setDegraded = useUiStore.getState().setSseDegraded;

  function enablePolling() {
    if (polling) return;
    polling = true;
    setDegraded(true);
    qc.setQueryDefaults(['printer'], { refetchInterval: POLL_INTERVAL_MS });
    qc.setQueryDefaults(['integration', 'status'], { refetchInterval: POLL_INTERVAL_MS });
    // Kick an immediate refetch so the UI does not wait a full interval.
    qc.invalidateQueries({ queryKey: ['printer'] });
    qc.invalidateQueries({ queryKey: queryKeys.integration.status() });
  }

  function disablePolling() {
    if (!polling) return;
    polling = false;
    setDegraded(false);
    qc.setQueryDefaults(['printer'], { refetchInterval: false });
    qc.setQueryDefaults(['integration', 'status'], { refetchInterval: false });
  }

  function dispatch(msg: SseMessage) {
    switch (msg.type) {
      case 'telemetry': {
        qc.setQueryData<TelemetrySnapshot>(
          queryKeys.printers.telemetry(msg.printerId),
          msg.snapshot,
        );
        qc.invalidateQueries({ queryKey: queryKeys.printers.slots(msg.printerId) });
        break;
      }
      case 'integrationStatus': {
        qc.invalidateQueries({ queryKey: queryKeys.integration.status() });
        break;
      }
      case 'lowStock': {
        qc.invalidateQueries({ queryKey: queryKeys.inventory.alerts() });
        qc.invalidateQueries({ queryKey: queryKeys.inventory.summary() });
        break;
      }
      case 'mappingVerify': {
        qc.invalidateQueries({ queryKey: queryKeys.printers.slots(msg.printerId) });
        break;
      }
      case 'jobUpdate': {
        qc.invalidateQueries({ queryKey: ['jobs'] });
        qc.invalidateQueries({ queryKey: queryKeys.jobs.detail(msg.jobId) });
        if (msg.kind === 'costed') {
          useUiStore.getState().pushToast({
            variant: 'success',
            title: 'Job costed',
            description: 'A print job cost snapshot was calculated.',
          });
        }
        break;
      }
    }
  }

  function connect() {
    if (closed) return;
    source = new EventSource('/api/events', { withCredentials: true });

    source.onopen = () => {
      consecutiveFailures = 0;
      disablePolling();
    };

    source.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as SseMessage;
        dispatch(msg);
      } catch {
        // Malformed frame — ignore (drift is handled server-side).
      }
    };

    source.onerror = () => {
      consecutiveFailures += 1;
      // EventSource auto-reconnects; after N failures fall back to polling.
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        enablePolling();
      }
      // If the browser closed the connection permanently, re-open manually.
      if (source && source.readyState === EventSource.CLOSED && !closed) {
        source.close();
        source = null;
        setTimeout(connect, POLL_INTERVAL_MS);
      }
    };
  }

  connect();

  return {
    close() {
      closed = true;
      disablePolling();
      if (source) {
        source.close();
        source = null;
      }
    },
  };
}
