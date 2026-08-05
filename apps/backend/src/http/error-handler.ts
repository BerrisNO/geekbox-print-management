import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ThrottledError } from '../shared/errors/index.js';

/**
 * Single RFC 7807 error formatter (ADR-013 §8.3). Never leaks stack traces in
 * production (A05). Bambu/upstream failures surface as sanitized 502 with the
 * raw cause logged server-side (ES-301.1).
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    // Zod validation errors → 400 with field map.
    if (err instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        const bucket = errors[key] ?? [];
        bucket.push(issue.message);
        errors[key] = bucket;
      }
      return sendProblem(reply, req, {
        status: 400,
        title: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors,
      });
    }

    if (err instanceof AppError) {
      if (err instanceof ThrottledError) {
        reply.header('Retry-After', String(err.retryAfterSec));
      }
      return sendProblem(reply, req, err.toProblem());
    }

    // Fastify's own validation (schema) errors.
    if (err.validation) {
      return sendProblem(reply, req, {
        status: 400,
        title: err.message,
        code: 'VALIDATION_ERROR',
      });
    }

    // Unknown error — log full detail, return sanitized 500.
    req.log.error({ err }, 'Unhandled error');
    return sendProblem(reply, req, {
      status: 500,
      title: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
  // The not-found handler is registered once in app.ts (Fastify allows only one per
  // prefix); it serves the SPA fallback or an RFC 7807 problem as appropriate.
}

type ProblemInput = {
  status: number;
  title: string;
  code: string;
  detail?: string;
  errors?: Record<string, string[]>;
};

export function sendProblem(
  reply: FastifyReply,
  req: FastifyRequest,
  p: ProblemInput,
): FastifyReply {
  return reply
    .status(p.status)
    .type('application/problem+json')
    .send({
      type: 'about:blank',
      title: p.title,
      status: p.status,
      code: p.code,
      instance: req.url,
      ...(p.detail ? { detail: p.detail } : {}),
      ...(p.errors ? { errors: p.errors } : {}),
    });
}
