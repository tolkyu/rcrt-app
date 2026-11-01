import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import type { FieldError } from './errors';
import { problemSchema } from './openapi';

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503;
export type DocumentedErrorStatus = ErrorStatus | 500;

const statusDescriptions: Record<DocumentedErrorStatus, string> = {
  400: 'Validation failed',
  401: 'Unauthenticated, session expired, user deactivated or MFA required',
  403: 'Forbidden (object visible, action not permitted, or CSRF check failed)',
  404: 'Not found or out of scope',
  409: 'Conflict',
  413: 'Request body exceeds 1 MiB',
  429: 'Rate limited',
  500: 'Unexpected error',
  503: 'Service temporarily unavailable',
};

/** Zod issues → `{ path: 'body.roles.0.role', code }`; messages never leave the server. */
export function zodFieldErrors(
  error: z.ZodError,
  prefix: string,
): FieldError[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].join('.'),
    code: issue.code,
  }));
}

/** Sorted, de-duplicated problem+json responses for the OpenAPI document. */
export function problemResponses(
  statuses: readonly DocumentedErrorStatus[],
): Record<number, ResponseConfig> {
  return Object.fromEntries(
    [...new Set(statuses)]
      .sort((a, b) => a - b)
      .map((status) => [
        status,
        {
          description: statusDescriptions[status],
          content: { 'application/problem+json': { schema: problemSchema } },
        },
      ]),
  );
}
