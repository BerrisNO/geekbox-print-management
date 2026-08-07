import {
  workOrderInputSchema,
  workOrderLinkJobSchema,
  workOrderPatchSchema,
} from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

export function registerWorkOrderRoutes(app: FastifyInstance, c: Container): void {
  app.get('/api/work-orders', async (req) => {
    const q = req.query as { includeArchived?: string };
    return c.workOrders.list(q.includeArchived === 'true');
  });
  app.post('/api/work-orders', async (req, reply) =>
    reply.status(201).send(c.workOrders.create(workOrderInputSchema.parse(req.body))),
  );
  app.get('/api/work-orders/:id', async (req) =>
    c.workOrders.getDetail((req.params as { id: string }).id),
  );
  app.patch('/api/work-orders/:id', async (req) =>
    c.workOrders.update((req.params as { id: string }).id, workOrderPatchSchema.parse(req.body)),
  );
  app.post('/api/work-orders/:id/archive', async (req) =>
    c.workOrders.archive((req.params as { id: string }).id),
  );

  app.post('/api/work-orders/:id/lines/:lineId/link-job', async (req) => {
    const { id, lineId } = req.params as { id: string; lineId: string };
    const body = workOrderLinkJobSchema.parse(req.body);
    return c.workOrders.linkJob(id, lineId, body.jobId);
  });
  app.post('/api/work-orders/:id/lines/:lineId/unlink-job', async (req) => {
    const { id, lineId } = req.params as { id: string; lineId: string };
    const body = workOrderLinkJobSchema.parse(req.body);
    return c.workOrders.unlinkJob(id, lineId, body.jobId);
  });
}
