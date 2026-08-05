import type { BambuCloudGateway, TelemetryEvent, TelemetrySource } from '../../ports.js';

export type RestPollConfig = {
  accessToken: string;
  serials: string[];
  intervalMs?: number; // >= 60s conservatism (A-05)
};

/**
 * RestPollTelemetryAdapter (A-03 fallback, ADR-006/012). Implements TelemetrySource
 * by polling REST task/status endpoints at <= 1 req/min. Degrades the dashboard
 * to task-level freshness with honest staleness (NFR-US-03). Activated when the
 * MS-1 spike shows MQTT (A-03) is unavailable.
 */
export class RestPollTelemetryAdapter implements TelemetrySource {
  private handlers: Array<(e: TelemetryEvent) => void> = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly gateway: BambuCloudGateway,
    private readonly config: RestPollConfig,
  ) {}

  on(handler: (event: TelemetryEvent) => void): void {
    this.handlers.push(handler);
  }

  private emit(e: TelemetryEvent): void {
    for (const h of this.handlers) {
      try {
        h(e);
      } catch {
        /* isolate */
      }
    }
  }

  async start(): Promise<void> {
    const interval = Math.max(60000, this.config.intervalMs ?? 60000);
    this.emit({ kind: 'connected' });
    const poll = async (): Promise<void> => {
      try {
        // Task-level freshness: fetch tasks and emit degraded telemetry markers.
        await this.gateway.fetchTasks(this.config.accessToken);
        // No per-slot telemetry available via REST; emit a degraded heartbeat so
        // the health panel shows the app is polling (task-level only).
        this.emit({ kind: 'degraded', detail: 'REST-poll telemetry (task-level freshness only)' });
      } catch {
        this.emit({ kind: 'degraded', detail: 'REST poll failed' });
      }
    };
    void poll();
    this.timer = setInterval(() => void poll(), interval);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
