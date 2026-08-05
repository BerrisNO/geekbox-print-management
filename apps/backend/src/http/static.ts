import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Serves the built frontend SPA (@fastify/static) with SPA fallback to
 * index.html for any non-API, non-asset route (ADR-014, architecture §5.1).
 */
export async function registerStatic(app: FastifyInstance, publicDir: string): Promise<void> {
  if (!existsSync(publicDir)) {
    app.log.warn(`Static assets directory not found at ${publicDir}; SPA will not be served`);
    return;
  }
  await app.register(fastifyStatic, { root: publicDir, prefix: '/', wildcard: false });

  // SPA fallback: any GET that is not an /api path and not a real file → index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
      instance: req.url,
    });
  });
}
