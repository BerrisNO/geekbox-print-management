import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Registers the built frontend SPA assets (@fastify/static). Returns whether the
 * assets were served (dir exists). The SPA fallback to index.html is handled by the
 * single not-found handler in app.ts (ADR-014, architecture §5.1), since Fastify
 * permits only one not-found handler per prefix.
 */
export async function registerStatic(app: FastifyInstance, publicDir: string): Promise<boolean> {
  if (!existsSync(publicDir)) {
    app.log.warn(`Static assets directory not found at ${publicDir}; SPA will not be served`);
    return false;
  }
  await app.register(fastifyStatic, { root: publicDir, prefix: '/', wildcard: false });
  return true;
}
