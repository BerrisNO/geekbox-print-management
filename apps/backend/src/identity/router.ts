import { changePasswordSchema, credentialsSchema } from '@geekbox/shared';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../container.js';
import { SESSION_COOKIE } from './session.js';

export function registerAuthRoutes(app: FastifyInstance, c: Container): void {
  const cookieOpts = (expiresMs: number) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: c.config.cookieSecure,
    path: '/',
    expires: new Date(expiresMs),
  });

  app.post('/api/auth/setup', async (req, reply) => {
    const body = credentialsSchema.parse(req.body);
    const { token, expiresAt, username } = await c.identity.setup(body.username, body.password);
    reply.setCookie(SESSION_COOKIE, token, cookieOpts(expiresAt));
    return reply.status(201).send({ username, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = credentialsSchema.parse(req.body);
    // Throttle per source IP (MR-003): a hostile client cannot lock out the
    // legitimate operator connecting from a different address.
    const { token, expiresAt } = await c.identity.login(body.username, body.password, req.ip);
    reply.setCookie(SESSION_COOKIE, token, cookieOpts(expiresAt));
    return reply.status(204).send();
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) c.identity.logout(req.auth.token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/auth/session', async (req, reply) => {
    const valid = c.sessions.validate(req.auth!.token);
    if (!valid) return reply.status(401).send();
    return reply.send({
      username: valid.username,
      expiresAt: new Date(valid.expiresAt).toISOString(),
    });
  });

  app.put('/api/auth/password', async (req, reply) => {
    const body = changePasswordSchema.parse(req.body);
    await c.identity.changePassword(
      req.auth!.userId,
      req.auth!.token,
      body.currentPassword,
      body.newPassword,
    );
    return reply.status(204).send();
  });
}
