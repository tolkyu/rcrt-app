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
import { findPrincipal } from '../repositories/principal';
import type { IdentityVerifier, VerifiedIdentity } from './identity';

export interface RequestMeta {
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /** Client-generated id echoed in change_feed so a tab can ignore its own updates (DG-11). */
  readonly mutationId: string | null;
}

/** Per-request context; services take it first and never read cookies or headers themselves. */
export interface RequestContext extends RequestMeta {
  readonly auth: AuthContext;
  readonly db: DbExecutor;
  readonly clock: Clock;
}

/** Cron/system work: same services, no user (actor_kind SYSTEM). */
export interface SystemContext extends Omit<RequestContext, 'auth'> {
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

export function requestMeta(headers: Headers): RequestMeta {
  const mutationId = headers.get('x-mutation-id');
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip') || null;
  return {
    requestId: crypto.randomUUID(),
    ip: ip && z.union([z.ipv4(), z.ipv6()]).safeParse(ip).success ? ip : null,
    userAgent: headers.get('user-agent')?.slice(0, 512) || null,
    mutationId:
      mutationId && uuid.safeParse(mutationId).success ? mutationId : null,
  };
}

/** Turns a verified identity into an AuthContext with one SQL query (ADR-002 §4, DG-05, §11). */
export async function loadAuthContext(
  db: DbExecutor,
  identity: VerifiedIdentity,
  clock: Clock,
): Promise<AuthContext> {
  const principal = await findPrincipal(db, identity, clock.now());
  if (!principal) throw new UnauthenticatedError('UNAUTHENTICATED');
  if (!principal.sessionValid)
    throw new UnauthenticatedError('SESSION_EXPIRED');
  if (!principal.isActive) throw new UnauthenticatedError('USER_DEACTIVATED');
  const roles: RoleAssignment[] = principal.roles.map((row) => ({
    role: row.role as RoleCode,
    verticalId: row.verticalId as VerticalId | null,
  }));
  return buildAuthContext({
    userId: principal.userId as UserId,
    roles,
    aal: identity.aal,
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
  const auth = await loadAuthContext(db, identity, deps.clock);
  return { ...meta, auth, db, clock: deps.clock };
}
