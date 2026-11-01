import type { Me } from '../../lib/schemas/me';
import type { RequestContext } from '../context/request-context';
import { UnauthenticatedError } from '../http/errors';
import { findUserProfile, findUserRoleAssignments } from '../repositories/user';

/** Current user, role assignments (display data) and effective grants for UI gating; the server still checks every action. */
export async function getMe(ctx: RequestContext): Promise<Me> {
  const { auth } = ctx;
  const [profile, assignments] = await Promise.all([
    findUserProfile(ctx.db, auth.userId),
    findUserRoleAssignments(ctx.db, auth.userId),
  ]);
  if (!profile) throw new UnauthenticatedError('UNAUTHENTICATED');
  return {
    user: profile,
    roles: assignments.map((row) => ({
      role: row.role,
      vertical:
        row.verticalId && row.verticalName
          ? { id: row.verticalId, name: row.verticalName }
          : null,
    })),
    mfaRequired: auth.mfaRequired,
    grants: [...auth.grants].flatMap(([permission, grants]) =>
      grants.map((grant) => ({
        permission,
        scope: grant.scope.kind,
        stage:
          grant.scope.kind === 'VERTICAL_FROM_STAGE' ? grant.scope.stage : null,
        verticalIds:
          grant.verticalIds === 'ALL' ? null : [...grant.verticalIds],
      })),
    ),
  };
}
