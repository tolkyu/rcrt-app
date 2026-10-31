import { pgErrorInfo } from '../db/errors';
import { DomainError, RateLimitedError, ValidationError } from './errors';
import { problemResponse } from './problem';

const triggerCode = /^[A-Z][A-Z0-9_]+$/;

/** Domain or database error → problem response; `null` means unexpected (500, reported by the caller). */
export function mapError(error: unknown, requestId: string): Response | null {
  if (error instanceof DomainError) {
    return problemResponse(error.status, error.code, requestId, {
      ...(error instanceof ValidationError ? { errors: error.errors } : {}),
      ...(error instanceof RateLimitedError
        ? { headers: { 'Retry-After': String(error.retryAfterSeconds) } }
        : {}),
    });
  }
  const pg = pgErrorInfo(error);
  // Triggers raise `ERRCODE P0001, MESSAGE '<CODE>'` for business invariants (docs/architecture.md §5).
  if (pg?.sqlState === 'P0001' && triggerCode.test(pg.message)) {
    return problemResponse(409, pg.message, requestId);
  }
  if (pg?.sqlState === '23505')
    return problemResponse(409, 'ALREADY_EXISTS', requestId);
  if (pg?.sqlState === '40001')
    return problemResponse(409, 'STALE_STATE', requestId);
  return null;
}
