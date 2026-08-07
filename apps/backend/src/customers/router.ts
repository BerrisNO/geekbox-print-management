import { customerInputSchema } from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

export function registerCustomerRoutes(app: FastifyInstance, c: Container): void {
  app.get('/api/customers', async (req) => {
    const q = req.query as { includeArchived?: string };
    return c.customers.list(q.includeArchived === 'true');
  });
  app.post('/api/customers', async (req, reply) =>
    reply.status(201).send(c.customers.create(customerInputSchema.parse(req.body))),
  );
  app.get('/api/customers/:id', async (req) => c.customers.get((req.params as { id: string }).id));
  app.patch('/api/customers/:id', async (req) =>
    c.customers.update(
      (req.params as { id: string }).id,
      customerInputSchema.partial().parse(req.body),
    ),
  );
  app.post('/api/customers/:id/archive', async (req) =>
    c.customers.archive((req.params as { id: string }).id),
  );
}
