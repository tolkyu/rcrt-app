import { pgErrorInfo } from '../db/errors';
import { DomainError, RateLimitedError, ValidationError } from './errors';
import { problemResponse } from './problem';

const triggerCode = /^[A-Z][A-Z0-9_]+$/;

/**
 * Unique constraints whose duplicates the caller can already see (Admin-only settings surfaces).
 * Any other unique violation is unexpected and goes to the 500 path, where only SQLSTATE and the
 * constraint name are logged, so it never confirms that a record exists elsewhere (SEC-CORE-06,
 * DG-11); candidate dedupe answers through its own rate-limited service.
 */
const VISIBLE_UNIQUE_CONSTRAINTS: Readonly<Record<string, string>> = {
  vertical_name_uq: 'VERTICAL_NAME_TAKEN',
  user_role_uq: 'ROLE_ALREADY_ASSIGNED',
  user_invite_pending_uq: 'INVITE_ALREADY_PENDING',
  /** Two Admins inviting the same email at once: the loser sees the same answer as a sequential retry. */
  app_user_email_uq: 'INVITE_PENDING',
};

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
  if (
    pg?.sqlState === '23505' &&
    pg.constraint &&
    Object.hasOwn(VISIBLE_UNIQUE_CONSTRAINTS, pg.constraint)
  )
    return problemResponse(
      409,
      VISIBLE_UNIQUE_CONSTRAINTS[pg.constraint]!,
      requestId,
    );
  if (pg?.sqlState === '40001')
    return problemResponse(409, 'STALE_STATE', requestId);
  return null;
}
