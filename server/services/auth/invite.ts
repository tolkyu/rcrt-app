import { normalizeFullName } from '@/lib/profile-name';
import { writeAudit } from '@/server/audit';
import { requirePermission } from '@/server/authz/can';
import { GLOBAL_ROLES } from '@/server/authz/roles';
import { BUILTIN_ROLE_CODES, type BuiltinRole } from '@/server/authz/types';
import type { AuthCookieStore } from '@/server/auth/cookies';
import { emailsMatch, normalizeEmail } from '@/server/auth/email';
import {
  INVITE_TTL_MS,
  generateInviteToken,
  hashInviteToken,
  inviteState,
} from '@/server/auth/invite-token';
import type { VerifiedIdentity } from '@/server/context/identity';
import type {
  RequestContext,
  SystemContext,
} from '@/server/context/request-context';
import type { DbExecutor } from '@/server/db';
import { appendEvent } from '@/server/events';
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@/server/http/errors';
import { inviteEmail } from '@/server/integrations/email/templates';
import {
  activateInvitedUser,
  consumeInvite,
  findInviteByHash,
  findUserByEmail,
  findVerticalIds,
  insertInvite,
  insertInvitedUser,
  insertUserRoles,
  listCurrentRoles,
  lockCurrentRoles,
} from '@/server/repositories/auth';
import { AUTH_LIMITS, consumeRateLimit } from '@/server/security/rate-limit';
import type { AuthDependencies } from './deps';
import {
  auditLoginFailure,
  establishSession,
  postSignInPath,
  withRateLimitAudit,
} from './session';

export const INVITE_COOKIE = 'hris-invite';
const INVITE_COOKIE_PATH = '/auth/callback';
const INVITE_COOKIE_MAX_AGE = 600;

/** Every unusable invite (unknown, used, revoked, expired, no roles left) answers the same way (T4-E06). */
const inviteInvalid = () => new ConflictError('INVITE_INVALID');

interface RoleInput {
  readonly role: string;
  readonly verticalId: string | null;
}

const isBuiltin = (role: string): role is BuiltinRole =>
  (BUILTIN_ROLE_CODES as readonly string[]).includes(role);

/** Global roles carry no vertical, vertical roles need an existing one (D40, T4-E07). */
async function rolesAreValid(db: DbExecutor, roles: readonly RoleInput[]) {
  if (roles.length === 0) return false;
  const keys = new Set(roles.map((r) => `${r.role}|${r.verticalId}`));
  if (keys.size !== roles.length) return false;
  for (const { role, verticalId } of roles) {
    if (!isBuiltin(role)) return false;
    if (GLOBAL_ROLES.has(role) !== (verticalId === null)) return false;
  }
  const verticalIds = [
    ...new Set(roles.flatMap((r) => (r.verticalId ? [r.verticalId] : []))),
  ];
  return (await findVerticalIds(db, verticalIds)).length === verticalIds.length;
}

function inviteUrl(appUrl: string, token: string) {
  return `${new URL('/invite', appUrl).href}#t=${token}`;
}

/**
 * Admin-only (aal2 via `settings.users.manage`, T4-E01). Creates the pending user, the roles and a
 * hashed 72 h token; the token travels only in the email fragment and is never returned (T4-E02/E03).
 */
export async function createInvite(
  deps: AuthDependencies,
  ctx: RequestContext,
  input: { email: string; fullName: string; roles: RoleInput[] },
): Promise<{
  userId: string;
  inviteId: string;
  expiresAt: string;
  delivered: boolean;
}> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const email = normalizeEmail(input.email);
  const fullName = normalizeFullName(input.fullName);
  if (!(await rolesAreValid(ctx.db, input.roles)))
    throw new ValidationError([{ path: 'body.roles', code: 'invalid_roles' }]);
  const existing = await findUserByEmail(ctx.db, email);
  if (existing) {
    if (!existing.isActive) throw new ConflictError('USER_DEACTIVATED');
    throw new ConflictError(
      existing.activatedAt ? 'USER_EXISTS' : 'INVITE_PENDING',
    );
  }
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const { token, hash } = generateInviteToken();
  const roles = input.roles.map(({ role, verticalId }) => ({
    role,
    verticalId,
  }));
  const created = await ctx.db.transaction(async (tx) => {
    const userId = await insertInvitedUser(tx, {
      email,
      fullName,
      createdBy: ctx.auth.userId,
      now,
    });
    await insertUserRoles(tx, userId, roles, ctx.auth.userId, now);
    const inviteId = await insertInvite(tx, {
      userId,
      tokenHash: hash,
      roles,
      invitedBy: ctx.auth.userId,
      sentAt: now,
      expiresAt,
    });
    const write = { ...ctx, db: tx };
    await appendEvent(tx, write, {
      type: 'user.invited',
      subjectType: 'app_user',
      subjectId: userId,
      payload: { inviteId, roles },
      pii: { email, fullName },
    });
    await writeAudit(tx, write, {
      action: 'user.invited',
      entityType: 'user',
      entityId: userId,
      after: { roles },
      details: { inviteId },
    });
    return { userId, inviteId };
  });
  const delivered = await deps.sendEmail(
    inviteEmail(email, {
      fullName,
      url: inviteUrl(deps.appUrl(), token),
      expiresAt,
    }),
  );
  return { ...created, expiresAt: expiresAt.toISOString(), delivered };
}

async function limitInvite(
  deps: AuthDependencies,
  ctx: SystemContext,
  token: string,
) {
  await withRateLimitAudit(ctx, 'INVITE', () =>
    consumeRateLimit(ctx.db, ctx.clock.now(), deps.rateLimitSecret(), [
      {
        namespace: 'auth:invite:ip',
        value: ctx.ip,
        limit: AUTH_LIMITS.invitePerIp,
      },
      {
        namespace: 'auth:invite:token',
        value: token,
        limit: AUTH_LIMITS.invitePerToken,
      },
    ]),
  );
}

/** A usable invite with its current roles; roles removed by an Admin since sending are respected (ROLE-05-2). */
async function usableInvite(db: DbExecutor, token: string, now: Date) {
  const invite = await findInviteByHash(db, hashInviteToken(token));
  if (!invite || !invite.isActive || inviteState(invite, now) !== 'VALID')
    return null;
  const roles = await listCurrentRoles(db, invite.userId);
  if (!(await rolesAreValid(db, roles))) return null;
  return { ...invite, roles };
}

export async function inspectInvite(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: { token: string },
) {
  await limitInvite(deps, ctx, input.token);
  const invite = await usableInvite(ctx.db, input.token, ctx.clock.now());
  if (!invite) return { state: 'INVALID' as const };
  return {
    state: 'VALID' as const,
    fullName: invite.fullName,
    email: invite.email,
    roles: invite.roles.map((r) => ({
      role: r.role,
      vertical: r.verticalName,
    })),
  };
}

/** Consume + link + activate in one short transaction; no external call runs while it holds row locks. */
async function acceptInTransaction(
  ctx: SystemContext,
  token: string,
  authUserId: string,
  expectedEmail: string,
): Promise<string | null> {
  try {
    return await ctx.db.transaction(async (tx) => {
      const hash = hashInviteToken(token);
      const invite = await findInviteByHash(tx, hash, true);
      if (
        !invite ||
        !invite.isActive ||
        !emailsMatch(invite.email, expectedEmail)
      )
        throw inviteInvalid();
      const roles = await lockCurrentRoles(tx, invite.userId);
      if (!(await rolesAreValid(tx, roles))) throw inviteInvalid();
      const now = ctx.clock.now();
      if (inviteState(invite, now) !== 'VALID') throw inviteInvalid();
      const consumed = await consumeInvite(tx, hash, now);
      if (!consumed) throw inviteInvalid();
      if (
        !(await activateInvitedUser(tx, {
          userId: consumed.userId,
          authUserId,
          now,
        }))
      )
        throw inviteInvalid();
      const write = { ...ctx, db: tx };
      await appendEvent(tx, write, {
        type: 'user.invite_accepted',
        subjectType: 'app_user',
        subjectId: consumed.userId,
        payload: { inviteId: consumed.id },
      });
      await appendEvent(tx, write, {
        type: 'user.activated',
        subjectType: 'app_user',
        subjectId: consumed.userId,
        payload: {},
      });
      await writeAudit(tx, write, {
        action: 'user.invite_accepted',
        entityType: 'user',
        entityId: consumed.userId,
        details: { inviteId: consumed.id },
      });
      return consumed.userId;
    });
  } catch (error) {
    if (error instanceof ConflictError) return null;
    throw error;
  }
}

/**
 * Magic-link path (T4-E07/E08): the confirmed auth user is created for exactly the invite email, the
 * invite consumed atomically, then a session is issued server-side for that email.
 */
export async function acceptInvite(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: { token: string },
  cookies: AuthCookieStore,
): Promise<{ redirectTo: string }> {
  await limitInvite(deps, ctx, input.token);
  const invite = await usableInvite(ctx.db, input.token, ctx.clock.now());
  if (!invite) {
    await auditLoginFailure(ctx, 'INVITE', 'INVITE_INVALID');
    throw inviteInvalid();
  }
  const admin = deps.admin();
  const authUserId = await admin.ensureUser(invite.email);
  if (!authUserId) throw new Error('Auth user provisioning failed');
  if (
    !(await acceptInTransaction(ctx, input.token, authUserId, invite.email))
  ) {
    await auditLoginFailure(ctx, 'INVITE', 'INVITE_INVALID', invite.userId);
    throw inviteInvalid();
  }
  const tokenHash = await admin.magicLinkTokenHash(invite.email, authUserId);
  const client = deps.createClient(cookies);
  const session = tokenHash ? await client.verifyMagicLink(tokenHash) : null;
  if (!session) throw new UnauthenticatedError();
  const { auth } = await establishSession(deps, ctx, {
    accessToken: session.accessToken,
    method: 'INVITE',
    cookies,
    client,
  });
  return { redirectTo: postSignInPath(auth) };
}

/** Google path: the invite is only checked here and consumed in the callback once the Google email matches (T4-E08). */
export async function startInviteGoogle(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: { token: string },
  cookies: AuthCookieStore,
): Promise<{ url: string }> {
  if (!deps.googleEnabled()) throw new NotFoundError();
  await limitInvite(deps, ctx, input.token);
  const invite = await usableInvite(ctx.db, input.token, ctx.clock.now());
  if (!invite) throw inviteInvalid();
  // Supabase links the Google identity to this pre-created user only when the emails match.
  if (!(await deps.admin().ensureUser(invite.email)))
    throw new Error('Auth user provisioning failed');
  const url = await deps
    .createClient(cookies)
    .googleAuthorizeUrl(new URL('/auth/callback', deps.appUrl()).href);
  if (!url) throw new Error('Google authorization unavailable');
  cookies.setTransient(
    INVITE_COOKIE,
    input.token,
    INVITE_COOKIE_MAX_AGE,
    INVITE_COOKIE_PATH,
  );
  cookies.commit();
  return { url };
}

export function clearInviteCookie(cookies: AuthCookieStore) {
  cookies.setTransient(INVITE_COOKIE, '', 0, INVITE_COOKIE_PATH);
}

/** Called from the OAuth callback; true only when the verified Google email equals the invite email. */
export async function completeInviteGoogle(
  ctx: SystemContext,
  token: string,
  identity: VerifiedIdentity,
  google: { email: string | null; verified: boolean },
): Promise<boolean> {
  const invite = await usableInvite(ctx.db, token, ctx.clock.now());
  if (!invite || !google.verified || !emailsMatch(google.email, invite.email))
    return false;
  return (
    (await acceptInTransaction(
      ctx,
      token,
      identity.authUserId,
      invite.email,
    )) !== null
  );
}
