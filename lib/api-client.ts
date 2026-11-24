import type { z } from 'zod';

export interface ApiFieldError {
  readonly path: string;
  readonly code: string;
}

/** problem+json from /api/v1 as a typed error; `code` maps to a Ukrainian message in the UI. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fieldErrors: readonly ApiFieldError[] = [],
    readonly details: Readonly<Record<string, string>> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** MFA_REQUIRED is also a 401, but it withholds one grant and leaves the session alive. */
export const isSessionLoss = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 401 &&
  error.code !== 'MFA_REQUIRED';

interface RequestOptions<S extends z.ZodType> {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly schema: S | (() => Promise<S>);
  readonly signal?: AbortSignal;
  /** Only the create calls' idempotency key: a caller cannot override the CSRF or content headers. */
  readonly headers?: { readonly 'Idempotency-Key'?: string };
  /** Query refetches send `X-Activity: background` so they do not extend the 12 h idle timer (T4-B03). */
  readonly background?: boolean;
}

/** problem+json body; any other error body has no string `code`. */
type ProblemBody = {
  code?: unknown;
  errors?: ApiFieldError[];
  details?: Record<string, string>;
} | null;

/** Same-origin fetch for /api/v1: cookies carry the session; mutations add the CSRF transport header (FND-5). */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  {
    method = 'GET',
    body,
    schema,
    signal,
    background,
    headers,
  }: RequestOptions<S>,
): Promise<z.output<S>> {
  // A schema chunk that cannot load must stop the call before the server acts (magic link, aal2, enrolment, logout).
  const validator = typeof schema === 'function' ? await schema() : schema;
  const mutation = method !== 'GET';
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...headers,
      ...(background ? { 'X-Activity': 'background' } : {}),
      ...(mutation
        ? { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' }
        : {}),
    },
    ...(mutation ? { body: JSON.stringify(body ?? {}) } : {}),
    ...(signal ? { signal } : {}),
  });
  const payload = (await response.json().catch(() => null)) as ProblemBody;
  if (!response.ok) {
    throw typeof payload?.code === 'string'
      ? new ApiError(
          response.status,
          payload.code,
          payload.errors ?? [],
          payload.details ?? {},
        )
      : new ApiError(response.status, 'INTERNAL');
  }
  return validator.parse(payload);
}
