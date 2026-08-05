import { createReadStream, statSync } from 'node:fs';
import type { HealthStatus } from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';
import { createBackup } from '../system/backup.js';

export function registerSystemRoutes(app: FastifyInstance, c: Container): void {
  // Health (unauthenticated — allow-listed). Drives the Docker healthcheck.
  app.get('/api/health', async (_req, reply) => {
    let dbWritable = false;
    try {
      c.db.$client.prepare('SELECT 1').get();
      dbWritable = true;
    } catch {
      dbWritable = false;
    }
    const sup = c.supervisor.getState();
    const link = c.db.$client
      .prepare('SELECT last_mqtt_message_at as t FROM cloud_link LIMIT 1')
      .get() as { t: number | null } | undefined;
    const ageSec = link?.t != null ? (Date.now() - link.t) / 1000 : null;
    const status: HealthStatus = {
      status: dbWritable ? 'ok' : 'degraded',
      components: {
        db: { writable: dbWritable },
        integration: { listenerState: sup.listenerState, lastMqttMessageAgeSec: ageSec },
      },
    };
    return reply.status(dbWritable ? 200 : 503).send(status);
  });

  // Backup — session-gated (NOT allow-listed), sensitive (RISK-009). This is a
  // state-changing operation (it writes a fresh backup file to disk AND streams the
  // whole DB), so it MUST be POST, not GET: a GET is trivially triggerable
  // cross-site (<img>/<a>/prefetch) and would let a malicious page force backups
  // and exfiltrate the database under the user's Lax-SameSite cookie (CWE-352,
  // MR-002). POST + the Origin check in app.ts closes the CSRF vector.
  app.post('/api/backup', async (_req, reply) => {
    const file = createBackup(c.db, c.config.backupDir);
    const size = statSync(file).size;
    reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${file.split(/[\\/]/).pop()}"`)
      .header('content-length', String(size));
    return reply.send(createReadStream(file));
  });
}
