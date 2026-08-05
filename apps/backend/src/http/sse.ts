import type { SseMessage } from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { DomainEvent, EventBus } from '../bus/event-bus.js';

/**
 * SSE broadcaster (ADR-005). GET /api/events streams server→browser messages.
 * Telemetry is throttled to >=1s spacing per printer. Translates the in-process
 * domain events into the 5 browser SseMessage types (api-contracts Part C).
 */
export class SseBroadcaster {
  private clients = new Set<(msg: SseMessage, id: number) => void>();
  private seq = 0;
  private lastTelemetryEmit = new Map<string, number>();

  constructor(
    bus: EventBus,
    private readonly now: () => number = Date.now,
  ) {
    bus.subscribe((e) => this.onDomainEvent(e));
  }

  private onDomainEvent(e: DomainEvent): void {
    switch (e.type) {
      case 'TelemetrySnapshotUpdated': {
        const last = this.lastTelemetryEmit.get(e.printerId) ?? 0;
        if (this.now() - last < 1000) return; // throttle >=1s per printer
        this.lastTelemetryEmit.set(e.printerId, this.now());
        this.broadcast({
          type: 'telemetry',
          printerId: e.printerId,
          snapshot: e.snapshot,
          capturedAt: e.snapshot.capturedAt,
        });
        break;
      }
      case 'IntegrationStateChanged':
        this.broadcast({
          type: 'integrationStatus',
          state: e.state,
          detail: e.detail,
          nextRetryAt: e.nextRetryAt,
        });
        break;
      case 'LowStockThresholdCrossed':
        this.broadcast({
          type: 'lowStock',
          productId: e.productId,
          active: true,
          currentG: e.currentG,
          thresholdG: e.thresholdG,
          onOrderQty: e.onOrderQty,
          earliestEta: e.earliestEta,
        });
        break;
      case 'LowStockCleared':
        this.broadcast({
          type: 'lowStock',
          productId: e.productId,
          active: false,
          currentG: 0,
          thresholdG: null,
          onOrderQty: 0,
          earliestEta: null,
        });
        break;
      case 'MappingVerifyFlagged':
        this.broadcast({
          type: 'mappingVerify',
          printerId: e.printerId,
          slotRef: e.slotRef,
          reason: e.reason,
        });
        break;
      case 'FilamentConsumptionRecorded':
        this.broadcast({
          type: 'jobUpdate',
          jobId: e.jobId,
          kind: e.pending ? 'consumption_pending' : 'consumption_posted',
        });
        break;
      case 'PrintJobCosted':
        this.broadcast({ type: 'jobUpdate', jobId: e.jobId, kind: 'costed' });
        break;
      case 'PrintJobObserved':
        this.broadcast({ type: 'jobUpdate', jobId: e.jobId, kind: e.kind });
        break;
      default:
        break;
    }
  }

  private broadcast(msg: SseMessage): void {
    const id = ++this.seq;
    // Isolate per-client writes: one client with a dead/broken socket must not
    // abort delivery to every other client (BUG-004). A throwing writer is
    // evicted so a stale connection cannot repeatedly break the broadcast.
    for (const send of this.clients) {
      try {
        send(msg, id);
      } catch {
        this.clients.delete(send);
      }
    }
  }

  register(app: FastifyInstance): void {
    app.get('/api/events', (req, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      reply.raw.write(`retry: 3000\n\n`);

      const send = (msg: SseMessage, id: number): void => {
        // May throw on a broken pipe; broadcast() catches and evicts.
        reply.raw.write(`id: ${id}\nevent: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`);
      };
      this.clients.add(send);

      const cleanup = (): void => {
        clearInterval(keepAlive);
        this.clients.delete(send);
      };

      const keepAlive = setInterval(() => {
        try {
          reply.raw.write(`: ping\n\n`);
        } catch {
          // Socket gone between close events — clean up defensively.
          cleanup();
        }
      }, 25000);

      req.raw.on('close', cleanup);
      reply.raw.on('error', cleanup);
    });
  }
}
