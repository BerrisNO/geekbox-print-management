import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SessionService } from '../identity/session.js';
import { SESSION_COOKIE } from '../identity/session.js';
import { sendProblem } from './error-handler.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; username: string; token: string };
  }
}

/**
 * Global deny-by-default session gate (NFR-SE-06, ADR-007). Every route is
 * rejected with 401 unless it is on the explicit allow-list or a valid session
 * cookie is present. This is the A01 control (there is no RBAC — C-03).
 */
const ALLOW_LIST: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/auth/setup' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
];

function isAllowListed(req: FastifyRequest): boolean {
  const url = req.url.split('?')[0] ?? req.url;
  // Non-API paths (SPA assets, index.html) are served by static and are public.
  if (!url.startsWith('/api/')) return true;
  return ALLOW_LIST.some((a) => a.method === req.method && a.path === url);
}

export function registerSessionGate(app: FastifyInstance, sessions: SessionService): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (isAllowListed(req)) return;
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      return sendProblem(reply, req, {
        status: 401,
        title: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }
    const valid = sessions.validate(token);
    if (!valid) {
      return sendProblem(reply, req, {
        status: 401,
        title: 'Session expired',
        code: 'UNAUTHORIZED',
      });
    }
    req.auth = { userId: valid.userId, username: valid.username, token };
  });
}

export { ALLOW_LIST };
