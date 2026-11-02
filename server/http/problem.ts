import type { FieldError } from './errors';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface Problem {
  readonly type: string;
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly errors?: readonly FieldError[];
  readonly details?: Readonly<Record<string, string>>;
}

/** RFC 9457 body shared by defineRoute and middleware; edge-safe (no Node APIs). */
export function problemResponse(
  status: number,
  code: string,
  requestId: string,
  extra: {
    errors?: readonly FieldError[];
    details?: Readonly<Record<string, string>>;
    headers?: HeadersInit;
  } = {},
): Response {
  const body: Problem = {
    type: `urn:hris:problem:${code.toLowerCase().replaceAll('_', '-')}`,
    status,
    code,
    requestId,
    ...(extra.errors ? { errors: extra.errors } : {}),
    ...(extra.details ? { details: extra.details } : {}),
  };
  const headers = new Headers(extra.headers);
  headers.set('Content-Type', PROBLEM_CONTENT_TYPE);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(body), { status, headers });
}
