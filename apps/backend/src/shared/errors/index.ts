/**
 * AppError hierarchy + domain error code catalog. The single RFC 7807 formatter
 * in http/error-handler.ts converts these to problem+json responses.
 */

export type ProblemPayload = {
  status: number;
  title: string;
  code: string;
  detail?: string;
  errors?: Record<string, string[]>;
};

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  toProblem(): ProblemPayload {
    return {
      status: this.status,
      title: this.message,
      code: this.code,
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errors?: Record<string, string[]>) {
    super(400, 'VALIDATION_ERROR', message, errors);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class UnprocessableError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ThrottledError extends AppError {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number, message = 'Too many attempts') {
    super(429, 'THROTTLED', message);
    this.retryAfterSec = retryAfterSec;
  }
}

/** Sanitized upstream (Bambu) failure — never leaks raw upstream detail (ES-301.1). */
export class UpstreamError extends AppError {
  constructor(code = 'UPSTREAM_UNAVAILABLE', message = 'Upstream service unavailable') {
    super(502, code, message);
  }
}
