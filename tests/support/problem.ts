import { randomUUID } from 'node:crypto';
import { problemResponse } from '../../server/http/problem';
import type { FieldError } from '../../server/http/errors';

/** `route.fulfill` options for the exact problem+json the API sends (server/http/problem.ts) for `status`/`code`. */
export async function problemFulfill(
  status: number,
  code: string,
  errors?: readonly FieldError[],
) {
  const response = problemResponse(
    status,
    code,
    randomUUID(),
    errors ? { errors } : {},
  );
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}
