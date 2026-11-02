import { writeAudit } from '@/server/audit';
import { requirePermission } from '@/server/authz/can';
import type { AuthCookieStore } from '@/server/auth/cookies';
import type { AuthClient } from '@/server/auth/client';
import { safeNextPath } from '@/server/auth/safe-redirect';
import { SESSION_ABSOLUTE_MS } from '@/server/auth/session-policy';
import type { RequestContext } from '@/server/context/request-context';
import { appendEvent, USER_SUBJECT } from '@/server/events';
import {
  ConflictError,
  ForbiddenError,
  MfaResetIncompleteError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '@/server/http/errors';
import { mfaResetEmail } from '@/server/integrations/email/templates';
import {
  findSessionStart,
  findUserById,
  markSessionMfaVerified,
  setMfaLock,
} from '@/server/repositories/auth';
import {
  AUTH_LIMITS,
  consumeRateLimit,
  reserveMfaAttempt,
} from '@/server/security/rate-limit';
import type { AuthDependencies } from './deps';
import { revokeMfaResetSessions } from './session';

/** D22: up to two verified TOTP devices (main + backup); no recovery codes. */
export const MAX_VERIFIED_FACTORS = 2;
/** A Bearer principal cannot authorize MFA changes through another cookie session. */
async function boundMfaClient(
  deps: AuthDependencies,
  ctx: RequestContext,
  cookies: AuthCookieStore,
): Promise<AuthClient> {
  const client = deps.createClient(cookies);
  try {
    const token = await client.currentAccessToken();
    const identity = token
      ? await deps.verifyIdentity(
          new Headers({ authorization: `Bearer ${token}` }),
        )
      : null;
    if (
      !identity ||
      identity.authUserId !== ctx.identity.authUserId ||
      identity.sessionId !== ctx.identity.sessionId ||
      identity.aal !== ctx.identity.aal
    )
      throw new UnauthenticatedError();
  } catch {
    cookies.discard();
    throw new UnauthenticatedError();
  }
  return client;
}

export async function mfaStatus(deps: AuthDependencies, ctx: RequestContext) {
  const factors = await deps.admin().listTotpFactorIds(ctx.identity.authUserId);
  if (!factors) throw new Error('Factor listing unavailable');
  const verified = factors.filter((factor) => factor.verified);
  return {
    aal: ctx.auth.aal,
    required: ctx.auth.mfaRequired,
    hasOtherGrants: ctx.auth.grants.size > 0,
    canAddFactor:
      verified.length < MAX_VERIFIED_FACTORS &&
      (verified.length === 0 || ctx.auth.aal === 'aal2'),
    factors: verified.map((factor) => ({ id: factor.id, name: factor.name })),
  };
}

/**
 * Starts TOTP enrolment. With a verified factor already present this needs an aal2 session, so an
 * email-only account takeover cannot add its own device (T4-F03). Stale unverified factors are removed.
 */
export async function enrollTotp(
  deps: AuthDependencies,
  ctx: RequestContext,
  cookies: AuthCookieStore,
): Promise<{ factorId: string; qrCode: string; secret: string }> {
  await consumeRateLimit(ctx.db, ctx.clock.now(), deps.rateLimitSecret(), [
    {
      namespace: 'auth:mfa:enroll',
      value: ctx.auth.userId,
      limit: AUTH_LIMITS.mfaEnrollPerUser,
    },
  ]);
  const client = await boundMfaClient(deps, ctx, cookies);
  const factors = await client.listTotpFactors();
  if (!factors) throw new UnauthenticatedError();
  const verified = factors.filter((factor) => factor.status === 'verified');
  if (verified.length > 0 && ctx.auth.aal !== 'aal2')
    throw new UnauthenticatedError('MFA_REQUIRED');
  if (verified.length >= MAX_VERIFIED_FACTORS)
    throw new ConflictError('MFA_FACTOR_LIMIT');
  const admin = deps.admin();
  for (const stale of factors.filter(
    (factor) => factor.status === 'unverified',
  ))
    await admin.deleteFactor(ctx.identity.authUserId, stale.id);
  const enrolled = await client.enrollTotp(
    `TOTP ${crypto.randomUUID().slice(0, 8)}`,
  );
  if (!enrolled) throw new Error('TOTP enrolment unavailable');
  cookies.commit();
  return enrolled;
}

/**
 * Verifies a TOTP code through our API so failures are counted: five in 15 minutes lock the user,
 * and while locked even a correct code does not raise the session to aal2 (T4-F04). Only this path
 * records `mfa_verified_at`, so a direct GoTrue verify never unlocks Admin/Finance (SEC-AUTH-R02).
 */
export async function verifyTotp(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { factorId: string; code: string; next?: string | undefined },
  cookies: AuthCookieStore,
): Promise<{ redirectTo: string }> {
  const now = ctx.clock.now();
  const secret = deps.rateLimitSecret();
  const client = await boundMfaClient(deps, ctx, cookies);
  const factor = (await client.listTotpFactors())?.find(
    (f) => f.id === input.factorId,
  );
  if (!factor) throw new NotFoundError();
  let attempt: Awaited<ReturnType<typeof reserveMfaAttempt>>;
  try {
    attempt = await reserveMfaAttempt(
      ctx.db,
      ctx.clock,
      ctx.auth.userId,
      secret,
    );
  } catch (error) {
    cookies.discard();
    if (error instanceof RateLimitedError)
      await writeAudit(ctx.db, ctx, {
        action: 'auth.mfa_challenge_failed',
        result: 'DENIED',
        entityType: 'user',
        entityId: ctx.auth.userId,
        details: { reason: 'RATE_LIMITED' },
      });
    throw error;
  }
  let outcome: 'invalid' | 'success' | 'aborted' = 'aborted';
  let failure: { error: unknown } | null = null;
  let settled: Awaited<ReturnType<typeof attempt.release>>;
  try {
    const result = await client.verifyTotp(input.factorId, input.code);
    const identity = result
      ? await deps.verifyIdentity(
          new Headers({ authorization: `Bearer ${result.accessToken}` }),
        )
      : null;
    if (
      !identity ||
      identity.aal !== 'aal2' ||
      identity.sessionId !== ctx.identity.sessionId ||
      identity.authUserId !== ctx.identity.authUserId
    ) {
      outcome = 'invalid';
      await writeAudit(ctx.db, ctx, {
        action: 'auth.mfa_challenge_failed',
        result: 'DENIED',
        entityType: 'user',
        entityId: ctx.auth.userId,
        details: { reason: 'CODE_INVALID' },
      });
      throw new ValidationError(
        [{ path: 'body.code', code: 'MFA_CODE_INVALID' }],
        'MFA_CODE_INVALID',
      );
    }
    outcome = 'success';
  } catch (error) {
    cookies.discard();
    failure = { error };
  } finally {
    settled = await attempt.release(outcome);
  }
  if (settled.newlyLocked)
    await writeAudit(ctx.db, ctx, {
      action: 'auth.mfa_locked',
      result: 'DENIED',
      entityType: 'user',
      entityId: ctx.auth.userId,
      details: { minutes: 15 },
    });
  const remaining =
    (settled.lockedUntil?.getTime() ?? 0) - ctx.clock.now().getTime();
  if (remaining > 0) {
    cookies.discard();
    throw new RateLimitedError(Math.ceil(remaining / 1000));
  }
  if (failure) throw failure.error;
  try {
    await ctx.db.transaction(async (tx) => {
      if (
        !(await markSessionMfaVerified(
          tx,
          ctx.identity.sessionId,
          ctx.auth.userId,
          ctx.clock.now(),
        ))
      )
        throw new UnauthenticatedError('SESSION_EXPIRED');
      if (factor.status !== 'unverified') return;
      const write = { ...ctx, db: tx };
      await appendEvent(tx, write, {
        type: 'user.mfa_enrolled',
        subjectType: USER_SUBJECT,
        subjectId: ctx.auth.userId,
        payload: {},
      });
      await writeAudit(tx, write, {
        action: 'user.mfa_enrolled',
        entityType: 'user',
        entityId: ctx.auth.userId,
      });
    });
  } catch (error) {
    cookies.discard();
    throw error;
  }
  const started = await findSessionStart(ctx.db, ctx.identity.sessionId);
  if (started)
    cookies.limitLifetime(
      (started.getTime() + SESSION_ABSOLUTE_MS - now.getTime()) / 1000,
    );
  cookies.commit();
  return { redirectTo: safeNextPath(input.next, '/') };
}

/**
 * «Скинути 2FA» (T4-F05): aal2 Admin only, never on themselves, reason required. All factors are
 * deleted, every session ends, the user is told by email and must re-enrol at next sign-in.
 */
export async function resetUserMfa(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { userId: string; reason: string },
): Promise<{ removedFactors: number }> {
  requirePermission(ctx.auth, 'settings.users.manage');
  if (input.userId === ctx.auth.userId) throw new ForbiddenError();
  const target = await findUserById(ctx.db, input.userId);
  if (!target) throw new NotFoundError();
  let removed = 0;
  let failed = 0;
  let factorListingFailed = false;
  let incomplete = false;
  if (target.authUserId) {
    try {
      const admin = deps.admin();
      const factors = await admin.listTotpFactorIds(target.authUserId);
      if (!factors) {
        factorListingFailed = true;
        incomplete = true;
      } else {
        for (const factor of factors) {
          try {
            if (await admin.deleteFactor(target.authUserId, factor.id))
              removed += 1;
            else failed += 1;
          } catch {
            failed += 1;
          }
        }
        incomplete = failed > 0;
      }
    } catch {
      factorListingFailed = true;
      incomplete = true;
    }
  }
  let sessionsRevoked = false;
  try {
    await revokeMfaResetSessions(ctx, target.id);
    sessionsRevoked = true;
  } catch {
    incomplete = true;
  }
  if (!incomplete && target.authUserId) {
    try {
      const remaining = await deps.admin().listTotpFactorIds(target.authUserId);
      if (!remaining) {
        factorListingFailed = true;
        incomplete = true;
      } else if (remaining.length > 0) {
        failed = remaining.length;
        incomplete = true;
      }
    } catch {
      factorListingFailed = true;
      incomplete = true;
    }
  }
  if (incomplete) {
    await writeAudit(ctx.db, ctx, {
      action: 'user.mfa_reset',
      result: 'DENIED',
      entityType: 'user',
      entityId: target.id,
      details: {
        reason: 'MFA_RESET_INCOMPLETE',
        removedFactors: removed,
        failedFactors: failed,
        factorListingFailed,
        sessionsRevoked,
      },
    });
    throw new MfaResetIncompleteError();
  }
  await ctx.db.transaction(async (tx) => {
    const write = { ...ctx, db: tx };
    await setMfaLock(tx, target.id, null);
    await appendEvent(tx, write, {
      type: 'user.mfa_reset',
      subjectType: USER_SUBJECT,
      subjectId: target.id,
      payload: {},
      pii: { reason: input.reason },
    });
    await writeAudit(tx, write, {
      action: 'user.mfa_reset',
      entityType: 'user',
      entityId: target.id,
      after: { reason: input.reason },
      details: { removedFactors: removed },
    });
  });
  await deps.sendEmail(mfaResetEmail(target.email, target.fullName));
  return { removedFactors: removed };
}
