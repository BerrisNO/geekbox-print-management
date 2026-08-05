import {
  integrationSettingsPatchSchema,
  linkAccountSchema,
  manualTokenSchema,
  mapSlotSchema,
  registerPrinterSchema,
  slotRefSchema,
  updatePrinterSchema,
  verifyLinkSchema,
} from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';

export function registerIntegrationRoutes(app: FastifyInstance, c: Container): void {
  // ---- integration link/settings ----
  app.get('/api/integration/status', async () => c.integration.status());
  app.post('/api/integration/link', async (req, reply) => {
    const body = linkAccountSchema.parse(req.body);
    const result = await c.integration.linkAccount(body.email, body.password);
    if ('state' in result && result.state === 'code_required')
      return reply.status(202).send(result);
    return reply.send(result);
  });
  app.delete('/api/integration/link', async (_req, reply) => {
    c.integration.unlink();
    return reply.status(204).send();
  });
  app.post('/api/integration/link/verify', async (req) => {
    const body = verifyLinkSchema.parse(req.body);
    return c.integration.verifyCode(body.challengeId, body.code);
  });
  app.post('/api/integration/link/manual-token', async (req) => {
    const body = manualTokenSchema.parse(req.body);
    return c.integration.linkWithManualToken(body.bambuUid, body.accessToken, body.refreshToken);
  });
  app.get('/api/integration/settings', async () => c.integration.settings());
  app.patch('/api/integration/settings', async (req) =>
    c.integration.updateSettings(integrationSettingsPatchSchema.parse(req.body)),
  );

  // ---- printers ----
  app.get('/api/printers', async () => c.integration.listPrinters());
  app.post('/api/printers', async (req, reply) =>
    reply.status(201).send(c.integration.registerManually(registerPrinterSchema.parse(req.body))),
  );
  app.post('/api/printers/refresh', async () => c.integration.refreshPrinters());
  app.patch('/api/printers/:id', async (req) =>
    c.integration.updatePrinter(
      (req.params as { id: string }).id,
      updatePrinterSchema.parse(req.body),
    ),
  );
  app.get('/api/printers/:id/telemetry', async (req) =>
    c.taskSync.getSnapshot((req.params as { id: string }).id),
  );

  // ---- AMS slots & mapping ----
  app.get('/api/printers/:id/slots', async (req) =>
    c.ams.listSlots((req.params as { id: string }).id),
  );
  app.put('/api/printers/:id/slots/:slotRef/mapping', async (req) => {
    const params = req.params as { id: string; slotRef: string };
    const slotRef = slotRefSchema.parse(params.slotRef);
    const body = mapSlotSchema.parse(req.body);
    return c.ams.mapSlot(params.id, slotRef, body.spoolId);
  });
  app.delete('/api/printers/:id/slots/:slotRef/mapping', async (req, reply) => {
    const params = req.params as { id: string; slotRef: string };
    c.ams.unmapSlot(params.id, slotRefSchema.parse(params.slotRef));
    return reply.status(204).send();
  });
  app.post('/api/printers/:id/slots/:slotRef/mapping/confirm', async (req) => {
    const params = req.params as { id: string; slotRef: string };
    return c.ams.confirmMapping(params.id, slotRefSchema.parse(params.slotRef));
  });
}
