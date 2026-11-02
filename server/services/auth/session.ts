import { decodeTimeIdCursor, encodeTimeIdCursor } from '@/lib/schemas/cursor';
import type { AuthContext } from '@/server/authz/context';
import { writeAudit } from '@/server/audit';
import type { AuthClient } from '@/server/auth/client';
import type { AuthCookieStore } from '@/server/auth/cookies';
import { safeNextPath } from '@/server/auth/safe-redirect';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from '@/server/auth/session-policy';
import type { VerifiedIdentity } from '@/server/context/identity';
import {
  loadAuthContext,
  type RequestContext,
  type SystemContext,
  type WriteContext,
} from '@/server/context/request-context';
import {
  DomainError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '@/server/http/errors';
import {
  endAuthSessions,
  endUserSession,
  endUserSessions,
  findUserById,
  insertUserSession,
  listLoginHistory,
  listOpenSessions,
  type LOGIN_HISTORY_ACTIONS,
  recordAuthLogin,
  type SessionEndReason,
  type SessionMethod,
} from '@/server/repositories/auth';
import type { AuthDependencies } from './deps';

export type { SessionMethod };

/** Audit row for a refused sign-in: reason codes only, never the email, token or IP in details (T4-K02). */
export async function auditLoginFailure(
  ctx: SystemContext,
  method: SessionMethod,
  reason: string,
  userId: string | null = null,
) {
  await writeAudit(ctx.db, ctx, {
    action: 'auth.login_failed',
    result: 'DENIED',
    entityType: userId ? 'user' : null,
    entityId: userId,
    details: { method, reason },
  });
}

/** Rate-limited sign-in attempts are audited as DENIED before the neutral 429 goes out (T4-I01). */
export async function withRateLimitAudit<T>(
  ctx: SystemContext,
  method: SessionMethod,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RateLimitedError)
      await auditLoginFailure(ctx, method, 'RATE_LIMITED');
    throw error;
  }
}

function failureReason(error: unknown): string {
  if (error instanceof UnauthenticatedError) {
    if (error.code === 'USER_DEACTIVATED') return 'DEACTIVATED';
    if (error.code === 'SESSION_EXPIRED') return 'SESSION_REJECTED';
    return 'NOT_ELIGIBLE';
  }
  return 'TOKEN_REJECTED';
}

/** First page after sign-in: MFA when Admin/Finance grants are withheld, otherwise a safe `next` (DG-15). */
export function postSignInPath(
  auth: AuthContext,
  next?: string | null,
): string {
  if (auth.mfaRequired) return '/mfa/verify';
  return safeNextPath(next, '/');
}

/**
 * Turns a fresh Supabase session into an app session: the token is re-verified, the principal checked
 * against the DB, `user_session` and login history written, and only then are cookies committed.
 * On any failure the Supabase session is deleted and no cookie is set (T4-C08).
 */
export async function establishSession(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: {
    readonly accessToken: string;
    readonly method: SessionMethod;
    readonly cookies: AuthCookieStore;
    readonly client: AuthClient;
    /** Dev login only: the server itself completed the TOTP step on this aal2 session. */
    readonly mfaVerified?: boolean;
  },
): Promise<{ auth: AuthContext; identity: VerifiedIdentity }> {
  const identity = await deps.verifyIdentity(
    new Headers({ authorization: `Bearer ${input.accessToken}` }),
  );
  try {
    if (!identity) throw new UnauthenticatedError();
    const now = ctx.clock.now();
    const principal = await loadAuthContext(ctx.db, identity, ctx.clock, {
      requireAppSession: false,
      meta: ctx,
    });
    const mfaVerified = input.mfaVerified === true && identity.aal === 'aal2';
    const auth = await ctx.db.transaction(async (tx) => {
      if (!(await recordAuthLogin(tx, identity.authUserId, now)))
        throw new UnauthenticatedError();
      await insertUserSession(tx, {
        sessionId: identity.sessionId,
        userId: principal.userId,
        method: input.method,
        now,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        mfaVerifiedAt: mfaVerified ? now : null,
      });
      await writeAudit(
        tx,
        { ...ctx, db: tx, auth: principal, identity },
        {
          action: 'auth.login_succeeded',
          entityType: 'user',
          entityId: principal.userId,
          details: { method: input.method },
        },
      );
      return mfaVerified
        ? loadAuthContext(tx, identity, ctx.clock, { meta: ctx })
        : principal;
    });
    input.cookies.limitLifetime(SESSION_ABSOLUTE_MS / 1000);
    input.cookies.commit();
    return { auth, identity };
  } catch (error) {
    if (identity)
      await endAuthSessions(ctx.db, identity.authUserId, {
        only: identity.sessionId,
      });
    input.cookies.clear();
    await auditLoginFailure(ctx, input.method, failureReason(error));
    if (
      error instanceof DomainError &&
      !(error instanceof UnauthenticatedError)
    )
      throw error;
    throw new UnauthenticatedError(
      error instanceof UnauthenticatedError && error.code === 'USER_DEACTIVATED'
        ? 'USER_DEACTIVATED'
        : 'UNAUTHENTICATED',
    );
  }
}

/** Ends the current session server-side (the Supabase row is deleted) and always clears cookies (T4-B08, SEC-T4-06). */
export async function logout(
  deps: AuthDependencies,
  ctx: SystemContext,
  cookies: AuthCookieStore,
): Promise<{ redirectTo: '/login' }> {
  try {
    const token = await deps.createClient(cookies).currentAccessToken();
    const identity = token
      ? await deps.verifyIdentity(
          new Headers({ authorization: `Bearer ${token}` }),
        )
      : null;
    if (identity) {
      const now = ctx.clock.now();
      await ctx.db.transaction(async (tx) => {
        await endAuthSessions(tx, identity.authUserId, {
          only: identity.sessionId,
        });
        const userId = await endUserSession(
          tx,
          identity.sessionId,
          'LOGOUT',
          now,
        );
        if (userId)
          await writeAudit(
            tx,
            { ...ctx, db: tx },
            {
              action: 'auth.logged_out',
              entityType: 'user',
              entityId: userId,
              details: { scope: 'local' },
            },
          );
      });
    }
  } finally {
    cookies.clear();
  }
  return { redirectTo: '/login' };
}

/** «Завершити всі інші»: other sessions die on their next request, this one stays (T4-B07). */
export async function endOtherSessions(
  ctx: RequestContext,
): Promise<{ count: number }> {
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const count = await endAuthSessions(tx, ctx.identity.authUserId, {
      except: ctx.identity.sessionId,
    });
    await endUserSessions(
      tx,
      ctx.auth.userId,
      'USER',
      now,
      ctx.identity.sessionId,
    );
    await writeAudit(
      tx,
      { ...ctx, db: tx },
      {
        action: 'auth.session_revoked',
        entityType: 'user',
        entityId: ctx.auth.userId,
        details: { reason: 'USER', count },
      },
    );
    return { count };
  });
}

/** MFA reset only (SEC-ACT-02): deactivation must go through the user-lock-serialized user-activation service. */
export async function revokeMfaResetSessions(
  ctx: WriteContext,
  userId: string,
): Promise<{ count: number }> {
  const user = await findUserById(ctx.db, userId);
  if (!user) return { count: 0 };
  const count = await ctx.db.transaction(async (tx) => {
    const write = { ...ctx, db: tx };
    return revokeUserSessions(write, user, 'MFA_RESET');
  });
  return { count };
}

/**
 * Local revocation stays in the caller's transaction; lifecycle callers contact GoTrue before deleting Auth rows.
 * No audit row when nothing was open (reactivation, deactivation retry), so the log records real revocations only.
 */
export async function revokeUserSessions(
  ctx: WriteContext,
  user: { id: string; authUserId: string | null },
  reason: Extract<SessionEndReason, 'DEACTIVATED' | 'MFA_RESET'>,
): Promise<number> {
  const ended = user.authUserId
    ? await endAuthSessions(ctx.db, user.authUserId)
    : 0;
  const closed = await endUserSessions(
    ctx.db,
    user.id,
    reason,
    ctx.clock.now(),
  );
  if (ended > 0 || closed > 0)
    await writeAudit(ctx.db, ctx, {
      action: 'auth.session_revoked',
      entityType: 'user',
      entityId: user.id,
      details: { reason, count: ended },
    });
  return ended;
}

export async function listMySessions(ctx: RequestContext) {
  const now = ctx.clock.now().getTime();
  const rows = await listOpenSessions(
    ctx.db,
    ctx.auth.userId,
    new Date(now - SESSION_IDLE_MS),
    new Date(now - SESSION_ABSOLUTE_MS),
  );
  return {
    items: rows.map((row) => ({
      id: row.sessionId,
      method: row.method,
      startedAt: row.startedAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      userAgent: row.userAgent,
      current: row.sessionId === ctx.identity.sessionId,
    })),
  };
}

type HistoryAction =
  (typeof LOGIN_HISTORY_ACTIONS)[number] extends `auth.${infer A}` ? A : never;
const historyAction = (action: string) =>
  action.slice('auth.'.length) as HistoryAction;

/** Own login history, newest first; the cursor is the last row's `(occurred_at, id)` (AUD-3). */
export async function listMyLoginHistory(
  ctx: RequestContext,
  input: { cursor?: string | undefined; limit: number },
) {
  const cursor = input.cursor ? decodeTimeIdCursor(input.cursor) : null;
  if (input.cursor && !cursor)
    throw new ValidationError([
      { path: 'query.cursor', code: 'invalid_cursor' },
    ]);
  const rows = await listLoginHistory(
    ctx.db,
    ctx.auth.userId,
    input.limit,
    cursor,
  );
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      return {
        id: row.id.toString(),
        occurredAt: row.occurredAt.toISOString(),
        action: historyAction(row.action),
        result: row.result,
        method: typeof details.method === 'string' ? details.method : null,
        reason: typeof details.reason === 'string' ? details.reason : null,
        ip: row.ip,
        userAgent: row.userAgent,
      };
    }),
    nextCursor:
      rows.length > input.limit && last ? encodeTimeIdCursor(last) : null,
  };
}
