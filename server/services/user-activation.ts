import { diffRoleAssignments } from '../../lib/role-diff';
import {
  deactivateUserSchema,
  reactivateUserSchema,
  type DeactivateUserInput,
  type ReactivateUserInput,
  type UserActivationUpdated,
} from '../../lib/schemas/user';
import { writeAudit } from '../audit';
import { requirePermission } from '../authz/can';
import { isAdminAssignment } from '../authz/types';
import type { RequestContext } from '../context/request-context';
import { appendEvent, USER_SUBJECT } from '../events';
import {
  ConflictError,
  NotFoundError,
  UserActivationIncompleteError,
  ValidationError,
} from '../http/errors';
import { userIdOf } from '../http/params';
import {
  lockCurrentRoles,
  lockPendingInvite,
  lockUser,
  revokePendingInvites,
} from '../repositories/auth';
import { setUserActive } from '../repositories/user-activation';
import {
  deleteUserRoles,
  hasOtherActiveAdmin,
  lockAdminMembership,
} from '../repositories/user-roles';
import type { AuthDependencies } from './auth/deps';
import { roleSetIsValid } from './auth/invite';
import { revokeUserSessions } from './auth/session';

async function setBanned(
  deps: AuthDependencies,
  authUserId: string | null,
  banned: boolean,
): Promise<boolean> {
  if (!authUserId) return true;
  try {
    return await deps.admin().setBanned(authUserId, banned);
  } catch {
    return false;
  }
}

/** Provider changes happen under the user lock and before Auth-row writes, so GoTrue never waits on this transaction. */
export async function deactivateUser(
  deps: AuthDependencies,
  ctx: RequestContext,
  rawUserId: string,
  input: DeactivateUserInput,
): Promise<UserActivationUpdated> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const userId = userIdOf(rawUserId);
  if (!userId) throw new NotFoundError();
  const { expectedVersion, reason } = deactivateUserSchema.parse(input);
  if (userId === ctx.auth.userId) throw new ConflictError('SELF_DEACTIVATION');
  const result = await ctx.db.transaction(async (tx) => {
    await lockPendingInvite(tx, userId);
    const user = await lockUser(tx, userId);
    if (!user) throw new NotFoundError();
    if (user.version !== expectedVersion)
      throw new ConflictError('STALE_STATE');
    if (!user.activatedAt) throw new ConflictError('USER_NOT_ACTIVATED');
    const roles = await lockCurrentRoles(tx, userId);
    if (user.isActive && roles.some(isAdminAssignment)) {
      await lockAdminMembership(tx);
      if (!(await hasOtherActiveAdmin(tx, userId)))
        throw new ConflictError('LAST_ADMIN');
    }
    const banned = await setBanned(deps, user.authUserId, true);
    const now = ctx.clock.now();
    const write = { ...ctx, db: tx };
    await revokeUserSessions(write, user, 'DEACTIVATED');
    await revokePendingInvites(tx, userId, ctx.auth.userId, now);
    const version = user.isActive
      ? await setUserActive(tx, userId, false, ctx.auth.userId, now)
      : user.version;
    if (user.isActive) {
      await appendEvent(tx, write, {
        type: 'user.deactivated',
        subjectType: USER_SUBJECT,
        subjectId: userId,
        payload: {},
      });
      await writeAudit(tx, write, {
        action: 'user.deactivated',
        entityType: 'user',
        entityId: userId,
        before: { isActive: true },
        after: { isActive: false, ...(reason ? { reason } : {}) },
      });
    }
    if (!banned)
      await writeAudit(tx, write, {
        action: 'user.deactivated',
        result: 'DENIED',
        entityType: 'user',
        entityId: userId,
        details: { reason: 'DEACTIVATION_INCOMPLETE' },
      });
    return { version, status: 'DEACTIVATED' as const, complete: banned };
  });
  if (!result.complete)
    throw new UserActivationIncompleteError('DEACTIVATION_INCOMPLETE');
  return { version: result.version, status: result.status };
}

export async function reactivateUser(
  deps: AuthDependencies,
  ctx: RequestContext,
  rawUserId: string,
  input: ReactivateUserInput,
): Promise<UserActivationUpdated> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const userId = userIdOf(rawUserId);
  if (!userId) throw new NotFoundError();
  const { expectedVersion, roles } = reactivateUserSchema.parse(input);
  if (!(await roleSetIsValid(ctx.db, roles)))
    throw new ValidationError([{ path: 'body.roles', code: 'invalid_roles' }]);
  const result = await ctx.db.transaction(async (tx) => {
    await lockPendingInvite(tx, userId);
    const user = await lockUser(tx, userId);
    if (!user) throw new NotFoundError();
    if (user.version !== expectedVersion)
      throw new ConflictError('STALE_STATE');
    if (user.isActive) throw new ConflictError('USER_ALREADY_ACTIVE');
    if (!user.activatedAt) throw new ConflictError('USER_NOT_ACTIVATED');
    const current = await lockCurrentRoles(tx, userId);
    const { added, removed } = diffRoleAssignments(current, roles);
    if (added.length > 0)
      throw new ValidationError([
        { path: 'body.roles', code: 'roles_not_previous' },
      ]);
    const write = { ...ctx, db: tx };
    const unbanned = await setBanned(deps, user.authUserId, false);
    if (!unbanned) {
      await writeAudit(tx, write, {
        action: 'user.reactivated',
        result: 'DENIED',
        entityType: 'user',
        entityId: userId,
        details: { reason: 'REACTIVATION_INCOMPLETE' },
      });
      return { version: user.version, complete: false };
    }
    // Defensive: D45 does not require it (reactivation only adds Admins), but it keeps every ADMIN-membership change serialised.
    if (roles.some(isAdminAssignment)) await lockAdminMembership(tx);
    const now = ctx.clock.now();
    await revokeUserSessions(write, user, 'DEACTIVATED');
    await revokePendingInvites(tx, userId, ctx.auth.userId, now);
    await deleteUserRoles(tx, userId, removed);
    const version = await setUserActive(tx, userId, true, ctx.auth.userId, now);
    for (const role of removed)
      await appendEvent(tx, write, {
        type: 'user.role_removed',
        subjectType: USER_SUBJECT,
        subjectId: userId,
        payload: role,
      });
    await appendEvent(tx, write, {
      type: 'user.reactivated',
      subjectType: USER_SUBJECT,
      subjectId: userId,
      payload: { restoredRoles: roles },
    });
    await writeAudit(tx, write, {
      action: 'user.reactivated',
      entityType: 'user',
      entityId: userId,
      before: { isActive: false, roles: current },
      after: { isActive: true, roles },
    });
    return { version, complete: true };
  });
  if (!result.complete)
    throw new UserActivationIncompleteError('REACTIVATION_INCOMPLETE');
  return { version: result.version, status: 'ACTIVE' };
}
