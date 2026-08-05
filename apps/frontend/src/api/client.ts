import type { ProblemDetails } from '@geekbox/shared';

/**
 * fetch wrapper (frontend spec §API client). credentials:'include' so the
 * HttpOnly gbx_session cookie rides every request (ADR-007). RFC 7807
 * problem+json is parsed into a typed ApiError carrying field-level errors that
 * TanStack Form maps onto the offending fields.
 */

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;
  /** Field path -> messages (from ProblemDetails.errors). */
  readonly fieldErrors: Record<string, string[]>;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || `Request failed (${problem.status})`);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
    this.fieldErrors = problem.errors ?? {};
  }

  /** Stable domain error code, when present (e.g. PO_NOT_RECEIVABLE). */
  get code(): string | undefined {
    return this.problem.code;
  }
}

export interface RequestOptions {
  method?: string;
  /** JSON body; serialized automatically. */
  body?: unknown;
  /** Query params (undefined/null values dropped). */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toProblem(res: Response): Promise<ProblemDetails> {
  try {
    const data = (await res.json()) as Partial<ProblemDetails>;
    return {
      type: data.type ?? 'about:blank',
      title: data.title ?? res.statusText,
      status: data.status ?? res.status,
      detail: data.detail,
      instance: data.instance,
      code: data.code,
      errors: data.errors,
    };
  } catch {
    return { type: 'about:blank', title: res.statusText || 'Request failed', status: res.status };
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, headers } = opts;
  const init: RequestInit = {
    method,
    credentials: 'include',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(buildUrl(path, query), init);

  if (!res.ok) {
    throw new ApiError(await toProblem(res));
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  // Non-JSON success (e.g. CSV/binary) — return the Response for the caller.
  return res as unknown as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

/** Build a full API URL (for links / downloads that bypass fetch). */
export function apiUrl(path: string, query?: RequestOptions['query']): string {
  return buildUrl(path, query);
}
