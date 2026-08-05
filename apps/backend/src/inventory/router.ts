import {
  type Material,
  productInputSchema,
  type SpoolStatus,
  spoolAdjustSchema,
  spoolInputSchema,
  spoolPatchSchema,
  spoolStatusTransitionSchema,
  vendorInputSchema,
} from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

export function registerInventoryRoutes(app: FastifyInstance, c: Container): void {
  // ---- vendors ----
  app.get('/api/vendors', async (req) => {
    const q = req.query as { includeArchived?: string };
    return c.catalog.listVendors(q.includeArchived === 'true');
  });
  app.post('/api/vendors', async (req, reply) =>
    reply.status(201).send(c.catalog.createVendor(vendorInputSchema.parse(req.body))),
  );
  app.get('/api/vendors/:id', async (req) =>
    c.catalog.getVendor((req.params as { id: string }).id),
  );
  app.patch('/api/vendors/:id', async (req) =>
    c.catalog.updateVendor(
      (req.params as { id: string }).id,
      vendorInputSchema.partial().parse(req.body),
    ),
  );
  app.post('/api/vendors/:id/archive', async (req) =>
    c.catalog.archiveVendor((req.params as { id: string }).id),
  );

  // ---- products ----
  app.get('/api/products', async (req) => {
    const q = req.query as { material?: Material; vendorId?: string; includeArchived?: string };
    return c.catalog.listProducts({
      material: q.material,
      vendorId: q.vendorId,
      includeArchived: q.includeArchived === 'true',
    });
  });
  app.post('/api/products', async (req, reply) =>
    reply.status(201).send(c.catalog.createProduct(productInputSchema.parse(req.body))),
  );
  app.get('/api/products/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const product = c.catalog.getProduct(id);
    const stock = c.inventoryRead.stockRowById(id);
    return { ...product, stock };
  });
  app.patch('/api/products/:id', async (req) =>
    c.catalog.updateProduct(
      (req.params as { id: string }).id,
      productInputSchema.partial().parse(req.body),
    ),
  );
  app.post('/api/products/:id/archive', async (req) =>
    c.catalog.archiveProduct((req.params as { id: string }).id),
  );

  // ---- spools ----
  app.get('/api/spools', async (req) => {
    const q = req.query as {
      productId?: string;
      material?: Material;
      status?: SpoolStatus;
      vendorId?: string;
    };
    return c.spools.list(q);
  });
  app.post('/api/spools', async (req, reply) =>
    reply.status(201).send(c.spools.register(spoolInputSchema.parse(req.body))),
  );
  app.get('/api/spools/:id', async (req) => c.spools.get((req.params as { id: string }).id));
  app.patch('/api/spools/:id', async (req) =>
    c.spools.patch((req.params as { id: string }).id, spoolPatchSchema.parse(req.body)),
  );
  app.get('/api/spools/:id/ledger', async (req) =>
    c.spools.getLedger((req.params as { id: string }).id),
  );
  app.post('/api/spools/:id/adjust', async (req) =>
    c.spools.adjust((req.params as { id: string }).id, spoolAdjustSchema.parse(req.body)),
  );
  app.post('/api/spools/:id/status', async (req) => {
    const body = spoolStatusTransitionSchema.parse(req.body);
    return c.spools.transitionStatus(
      (req.params as { id: string }).id,
      body.status,
      body.confirmUnmap,
    );
  });

  // ---- inventory views ----
  app.get('/api/inventory/summary', async () => c.inventoryRead.summary());
  app.get('/api/inventory/alerts', async () => c.inventoryRead.alerts());
}
