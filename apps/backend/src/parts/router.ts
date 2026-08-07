import { partInputSchema } from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

export function registerPartRoutes(app: FastifyInstance, c: Container): void {
  app.get('/api/parts', async (req) => {
    const q = req.query as { includeArchived?: string };
    return c.parts.list(q.includeArchived === 'true');
  });
  app.post('/api/parts', async (req, reply) =>
    reply.status(201).send(c.parts.create(partInputSchema.parse(req.body))),
  );
  app.get('/api/parts/:id', async (req) => c.parts.get((req.params as { id: string }).id));
  app.patch('/api/parts/:id', async (req) =>
    c.parts.update((req.params as { id: string }).id, partInputSchema.partial().parse(req.body)),
  );
  app.post('/api/parts/:id/archive', async (req) =>
    c.parts.archive((req.params as { id: string }).id),
  );
}
