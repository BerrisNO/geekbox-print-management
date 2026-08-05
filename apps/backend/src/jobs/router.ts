import {
  attributeUsageSchema,
  costRatesInputSchema,
  jobCorrectionSchema,
  manualJobInputSchema,
} from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

type JobFilter = {
  printerId?: string;
  outcome?: string;
  from?: string;
  to?: string;
  sort?: 'date' | 'cost';
};

export function registerJobRoutes(app: FastifyInstance, c: Container): void {
  app.get('/api/jobs', async (req) => c.jobs.list(req.query as JobFilter));
  app.post('/api/jobs', async (req, reply) =>
    reply.status(201).send(c.jobs.createManual(manualJobInputSchema.parse(req.body))),
  );
  app.get('/api/jobs/:id', async (req) => c.jobs.get((req.params as { id: string }).id));
  app.patch('/api/jobs/:id', async (req) =>
    c.jobs.correct((req.params as { id: string }).id, jobCorrectionSchema.parse(req.body)),
  );
  app.post('/api/jobs/sync', async () => c.taskSync.sync());
  app.post('/api/jobs/:id/usages/:usageId/attribute', async (req) => {
    const params = req.params as { id: string; usageId: string };
    const body = attributeUsageSchema.parse(req.body);
    return c.jobs.attribute(params.id, params.usageId, body.spoolId);
  });
  app.post('/api/jobs/:id/recalculate', async (req) =>
    c.costing.recalculate((req.params as { id: string }).id),
  );
  app.get('/api/jobs/export.csv', async (req, reply) => {
    const csv = c.jobs.exportCsv(req.query as JobFilter);
    return reply
      .type('text/csv')
      .header('content-disposition', 'attachment; filename="jobs.csv"')
      .send(csv);
  });

  // ---- cost rate settings ----
  app.get('/api/settings/cost-rates', async () => c.costing.getRates());
  app.put('/api/settings/cost-rates', async (req) =>
    c.costing.updateRates(costRatesInputSchema.parse(req.body)),
  );
}
