import {
  diffRoleAssignments,
  roleAssignmentKey,
  type RoleAssignmentRef,
} from '../../lib/role-diff';
import {
  updateUserRolesSchema,
  type UpdateUserRolesInput,
  type UserRolesUpdated,
} from '../../lib/schemas/user';
import { writeAudit } from '../audit';
import { requirePermission } from '../authz/can';
import { isAdminAssignment } from '../authz/types';
import type { RequestContext } from '../context/request-context';
import { appendEvent, USER_SUBJECT } from '../events';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { uuidOf } from '../http/params';
import {
  insertUserRoles,
  lockCurrentRoles,
  lockPendingInvite,
  lockUser,
} from '../repositories/auth';
import {
  bumpUserVersion,
  deleteUserRoles,
  hasOtherActiveAdmin,
  lockAdminMembership,
} from '../repositories/user-roles';
import { roleSetIsValid } from './auth/invite';
import { removeTeamLeadPriorities } from './team-lead-priority';

const pick = ({ role, verticalId }: RoleAssignmentRef) => ({
  role,
  verticalId,
});
/** Audit before/after in key order, so the stored diff does not depend on the order roles were sent or read. */
const sorted = <T extends RoleAssignmentRef>(roles: readonly T[]) =>
  roles
    .map((role) => [roleAssignmentKey(role), role] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, role]) => role);

/**
 * «Змінити ролі» (STORY-ROLE-01-1/01-2): Admin with aal2 replaces the user's role set; the difference is
 * stored with one timeline event per assignment and one audit row. Grants are rebuilt from the table on
 * every request, so the change applies on the user's next request without re-login. A pending invite
 * stays as it is: acceptance reads the current roles (ROLE-05-2). Deactivated users keep their roles
 * frozen until «Активувати знову» (ROLE-05-5).
 */
export async function updateUserRoles(
  ctx: RequestContext,
  rawUserId: string,
  input: UpdateUserRolesInput,
): Promise<UserRolesUpdated> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const userId = uuidOf(rawUserId);
  if (!userId) throw new NotFoundError();
  const { roles, expectedVersion } = updateUserRolesSchema.parse(input);
  if (!(await roleSetIsValid(ctx.db, roles)))
    throw new ValidationError([{ path: 'body.roles', code: 'invalid_roles' }]);
  const now = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    // Same order as acceptance (invite, then user, then roles), so the two serialise instead of deadlocking.
    await lockPendingInvite(tx, userId);
    const user = await lockUser(tx, userId);
    if (!user) throw new NotFoundError();
    if (!user.isActive) throw new ConflictError('USER_DEACTIVATED');
    if (user.version !== expectedVersion)
      throw new ConflictError('STALE_STATE');
    const current = (await lockCurrentRoles(tx, userId)).map(pick);
    const { added, removed } = diffRoleAssignments(current, roles.map(pick));
    if (added.length === 0 && removed.length === 0)
      throw new ValidationError(
        [{ path: 'body.roles', code: 'unchanged' }],
        'ROLES_UNCHANGED',
      );
    if (removed.some(isAdminAssignment)) {
      if (userId === ctx.auth.userId)
        throw new ConflictError('SELF_ADMIN_REMOVAL');
      await lockAdminMembership(tx);
      if (!(await hasOtherActiveAdmin(tx, userId)))
        throw new ConflictError('LAST_ADMIN');
    }
    await deleteUserRoles(tx, userId, removed);
    if (added.length > 0)
      await insertUserRoles(tx, userId, added, ctx.auth.userId, now);
    const version = await bumpUserVersion(tx, userId, now);
    const write = { ...ctx, db: tx };
    for (const role of removed)
      await appendEvent(tx, write, {
        type: 'user.role_removed',
        subjectType: USER_SUBJECT,
        subjectId: userId,
        payload: role,
      });
    await removeTeamLeadPriorities(write, userId, removed);
    for (const role of added)
      await appendEvent(tx, write, {
        type: 'user.role_assigned',
        subjectType: USER_SUBJECT,
        subjectId: userId,
        payload: role,
      });
    const after = [...current.filter((r) => !removed.includes(r)), ...added];
    await writeAudit(tx, write, {
      action: 'user.roles_changed',
      entityType: 'user',
      entityId: userId,
      before: { roles: sorted(current) },
      after: { roles: sorted(after) },
    });
    return { version, added, removed };
  });
}
