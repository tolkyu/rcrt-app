import { z } from 'zod';
import { buildAuthContext, type AuthContext } from '../authz/context';
import type {
  RoleAssignment,
  RoleCode,
  UserId,
  VerticalId,
} from '../authz/types';
import type { DbExecutor } from '../db';
import type { Clock } from '../domain/clock';
import { UnauthenticatedError } from '../http/errors';
import { writeAudit } from '../audit';
import { evaluateSession } from '../auth/session-policy';
import { endAuthSessions, endUserSession } from '../repositories/auth';
import { findPrincipal } from '../repositories/principal';
import type { IdentityVerifier, VerifiedIdentity } from './identity';

export interface RequestMeta {
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /** Client-generated id echoed in change_feed so a tab can ignore its own updates (DG-11). */
  readonly mutationId: string | null;
  /** `X-Activity: background` (refetches, Realtime invalidations) does not extend the idle timer (T4-B03). */
  readonly background?: boolean;
}

/** Per-request context; services take it first and never read cookies or headers themselves. */
export interface RequestContext extends RequestMeta {
  readonly identity: VerifiedIdentity;
  readonly auth: AuthContext;
  readonly db: DbExecutor;
  readonly clock: Clock;
}

/** Cron/system work: same services, no user (actor_kind SYSTEM). */
export interface SystemContext extends Omit<
  RequestContext,
  'auth' | 'identity'
> {
  readonly auth: null;
}

export type WriteContext = RequestContext | SystemContext;

export interface ContextDependencies {
  readonly db: () => DbExecutor;
  readonly clock: Clock;
  /** Supplied by the auth integration; without it every request is unauthenticated (fail closed). */
  readonly verifyIdentity?: IdentityVerifier;
}

const uuid = z.uuid();

function anonymousMeta(): RequestMeta {
  return {
    requestId: crypto.randomUUID(),
    ip: null,
    userAgent: null,
    mutationId: null,
  };
}

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/** Only deployed Vercel overwrites this header; direct/local requests have no trusted proxy (SEC-T4-08). */
export function clientIp(
  headers: Headers,
  onVercel = process.env.VERCEL === '1' &&
    (process.env.VERCEL_ENV === 'production' ||
      process.env.VERCEL_ENV === 'preview'),
): string | null {
  if (!onVercel) return null;
  const ip = headers.get('x-vercel-forwarded-for')?.trim();
  return ip && ipSchema.safeParse(ip).success ? ip : null;
}

export function requestMeta(headers: Headers): RequestMeta {
  const mutationId = headers.get('x-mutation-id');
  return {
    requestId: crypto.randomUUID(),
    ip: clientIp(headers),
    userAgent: headers.get('user-agent')?.slice(0, 512) || null,
    mutationId:
      mutationId && uuid.safeParse(mutationId).success ? mutationId : null,
    background: headers.get('x-activity')?.toLowerCase() === 'background',
  };
}

export interface LoadAuthOptions {
  /** Sign-in flows load the principal before the app session row exists. */
  readonly requireAppSession?: boolean;
  readonly meta?: RequestMeta;
}

/** Turns a verified identity into an AuthContext with one SQL query (ADR-002 §4, DG-05, §11, SEC-AUTH-4). */
export async function loadAuthContext(
  db: DbExecutor,
  identity: VerifiedIdentity,
  clock: Clock,
  options: LoadAuthOptions = {},
): Promise<AuthContext> {
  const now = clock.now();
  const requireAppSession = options.requireAppSession !== false;
  const meta = options.meta ?? anonymousMeta();
  const principal = await findPrincipal(db, identity, now, {
    touch: requireAppSession && meta.background !== true,
  });
  if (!principal) throw new UnauthenticatedError('UNAUTHENTICATED');
  if (!principal.authSession) throw new UnauthenticatedError('SESSION_EXPIRED');
  if (!principal.isActive) throw new UnauthenticatedError('USER_DEACTIVATED');
  if (requireAppSession) {
    const session = principal.appSession;
    if (!session || session.ended)
      throw new UnauthenticatedError('SESSION_EXPIRED');
    const verdict = evaluateSession(
      {
        startedAt: principal.authSession.createdAt ?? session.startedAt,
        lastSeenAt: session.lastSeenAt,
      },
      now,
    );
    if (verdict.state === 'EXPIRED') {
      await db.transaction(async (tx) => {
        await endAuthSessions(tx, identity.authUserId, {
          only: identity.sessionId,
        });
        if (await endUserSession(tx, identity.sessionId, verdict.reason, now))
          await writeAudit(
            tx,
            { ...meta, auth: null, db: tx, clock },
            {
              action: 'auth.session_revoked',
              entityType: 'user',
              entityId: principal.userId,
              details: { reason: verdict.reason },
            },
          );
      });
      throw new UnauthenticatedError('SESSION_EXPIRED');
    }
  }
  const roles: RoleAssignment[] = principal.roles.map((row) => ({
    role: row.role as RoleCode,
    verticalId: row.verticalId as VerticalId | null,
  }));
  return buildAuthContext({
    userId: principal.userId as UserId,
    roles,
    // A TOTP lock after repeated failures downgrades the session until it expires (T4-F04).
    aal: principal.mfaLocked ? 'aal1' : identity.aal,
    timezone: principal.timezone,
  });
}

export async function resolveRequestContext(
  deps: ContextDependencies,
  headers: Headers,
  meta: RequestMeta = requestMeta(headers),
): Promise<RequestContext> {
  const identity = deps.verifyIdentity
    ? await deps.verifyIdentity(headers)
    : null;
  if (!identity) throw new UnauthenticatedError('UNAUTHENTICATED');
  const db = deps.db();
  const auth = await loadAuthContext(db, identity, deps.clock, { meta });
  return { ...meta, identity, auth, db, clock: deps.clock };
}
