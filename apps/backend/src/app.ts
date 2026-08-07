import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Container } from './container.js';
import { registerCustomerRoutes } from './customers/router.js';
import { registerErrorHandler, sendProblem } from './http/error-handler.js';
import { registerSessionGate } from './http/session-gate.js';
import { SseBroadcaster } from './http/sse.js';
import { registerStatic } from './http/static.js';
import { registerSystemRoutes } from './http/system-routes.js';
import { registerAuthRoutes } from './identity/router.js';
import { registerIntegrationRoutes } from './integration/router.js';
import { registerInventoryRoutes } from './inventory/router.js';
import { registerJobRoutes } from './jobs/router.js';
import { registerPartRoutes } from './parts/router.js';
import { registerProcurementRoutes } from './procurement/router.js';
import { registerWorkOrderRoutes } from './work-orders/router.js';

export type BuildAppOptions = {
  /** Directory of the built SPA to serve (absent in tests). */
  publicDir?: string;
  /** Whether to attach the SPA static handler (default true). */
  serveStatic?: boolean;
};

/**
 * Fastify factory. Registers plugins, the session gate, module routers, SSE, the
 * RFC 7807 error handler, and (optionally) the static SPA. Nothing here starts
 * network listeners or the telemetry supervisor — that is main.ts's job.
 */
export async function buildApp(c: Container, opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // Pass the pre-built pino instance via loggerInstance (Fastify v5). Cast to
  // FastifyBaseLogger so the instance keeps the default logger type — otherwise
  // Fastify infers the pino Logger type and route registrations/return type mismatch.
  const app = Fastify({
    loggerInstance: c.log as FastifyBaseLogger,
    disableRequestLogging: c.config.nodeEnv === 'test',
  });

  await app.register(fastifyCookie, { secret: c.config.sessionSecret });
  await app.register(fastifyHelmet, {
    // Strict, same-origin CSP (SEC-003/MR-002). The SPA is served same-origin. The
    // only inline script is the pre-paint theme bootstrap in index.html, allowed via
    // its sha256 hash (no 'unsafe-inline' for scripts). connect-src 'self' also
    // covers the SSE endpoint. upgrade-insecure-requests is disabled so the app works
    // over plain HTTP on a LAN/self-hosted origin (put a TLS reverse proxy in front
    // for HTTPS); left enabled it would force asset fetches to https and break them.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // Styles are emitted as a linked stylesheet; allow inline styles for the
        // CSS-in-JS fallbacks the design system uses.
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'sha256-L58j4kcl61hKP1Q1dVbR8pxed3thkyhrpCWCwob+N1Y='"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  await app.register(fastifyRateLimit, {
    global: false, // login route opts in; single user otherwise
    max: 100,
    timeWindow: '1 minute',
  });

  registerErrorHandler(app);

  // CSRF defense (MR-002/SEC-003): for state-changing methods, require the Origin
  // (or Referer fallback) to match the request's own Host. Combined with the
  // SameSite=Lax session cookie and POST-only mutations, this blocks cross-site
  // forged requests without needing per-form CSRF tokens in a single-user app.
  const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.addHook('onRequest', async (req, reply) => {
    if (!STATE_CHANGING.has(req.method)) return;
    const host = req.headers.host;
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    // Derive the source origin's host from Origin, else Referer.
    let sourceHost: string | null = null;
    try {
      if (origin) sourceHost = new URL(origin).host;
      else if (referer) sourceHost = new URL(referer).host;
    } catch {
      sourceHost = null;
    }
    // Reject when a cross-origin source is asserted. Requests with no Origin/Referer
    // (e.g. same-origin fetches that omit it, native clients) are allowed — the
    // SameSite cookie still gates them and they carry no attacker-controlled origin.
    if (sourceHost !== null && host !== undefined && sourceHost !== host) {
      return reply.status(403).send({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: 'Cross-origin request rejected',
      });
    }
  });

  registerSessionGate(app, c.sessions);

  // Module routers.
  registerAuthRoutes(app, c);
  registerInventoryRoutes(app, c);
  registerCustomerRoutes(app, c);
  registerPartRoutes(app, c);
  registerProcurementRoutes(app, c);
  registerWorkOrderRoutes(app, c);
  registerIntegrationRoutes(app, c);
  registerJobRoutes(app, c);
  registerSystemRoutes(app, c);

  // SSE broadcaster.
  const sse = new SseBroadcaster(c.bus);
  sse.register(app);

  // Static SPA + the single not-found handler (must come last). Fastify allows only
  // one not-found handler per prefix, so it lives here rather than in the error
  // handler: SPA fallback for browser GETs when static assets are served, RFC 7807
  // problem+json otherwise (API 404s and API-only/test mode).
  let staticServed = false;
  if (opts.serveStatic !== false && opts.publicDir) {
    staticServed = await registerStatic(app, opts.publicDir);
  }
  app.setNotFoundHandler((req, reply) => {
    if (staticServed && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return sendProblem(reply, req, { status: 404, title: 'Not found', code: 'NOT_FOUND' });
  });

  return app;
}
