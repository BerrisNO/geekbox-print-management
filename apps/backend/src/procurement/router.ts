import {
  poStatusTransitionSchema,
  purchaseOrderInputSchema,
  purchaseOrderPatchSchema,
  receptionInputSchema,
} from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

export function registerProcurementRoutes(app: FastifyInstance, c: Container): void {
  app.get('/api/purchase-orders', async (req) => {
    const q = req.query as { status?: string };
    return c.purchaseOrders.list(q.status);
  });
  app.post('/api/purchase-orders', async (req, reply) =>
    reply.status(201).send(c.purchaseOrders.create(purchaseOrderInputSchema.parse(req.body))),
  );
  app.get('/api/purchase-orders/:id', async (req) =>
    c.purchaseOrders.getDetail((req.params as { id: string }).id),
  );
  app.patch('/api/purchase-orders/:id', async (req) =>
    c.purchaseOrders.update(
      (req.params as { id: string }).id,
      purchaseOrderPatchSchema.parse(req.body),
    ),
  );
  app.post('/api/purchase-orders/:id/status', async (req) => {
    const body = poStatusTransitionSchema.parse(req.body);
    return c.purchaseOrders.transitionStatus((req.params as { id: string }).id, body.status);
  });

  app.get('/api/inbound', async () => c.inbound.overview());

  // ---- receptions ----
  app.get('/api/purchase-orders/:id/receptions', async (req) =>
    c.reception.list((req.params as { id: string }).id),
  );
  app.post('/api/purchase-orders/:id/receptions', async (req, reply) => {
    const body = receptionInputSchema.parse(req.body);
    return reply.status(201).send(c.reception.post((req.params as { id: string }).id, body));
  });
  app.get('/api/goods-receipts/:id', async (req) =>
    c.reception.getReceiptDetail((req.params as { id: string }).id),
  );
}
