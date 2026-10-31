import type { Me } from '../../lib/schemas/me';
import type { RequestContext } from '../context/request-context';
import { UnauthenticatedError } from '../http/errors';
import { findUserProfile } from '../repositories/user';
import { findVerticalNames } from '../repositories/vertical';

/** Current user, role assignments and effective grants for UI gating; the server still checks every action. */
export async function getMe(ctx: RequestContext): Promise<Me> {
  const { auth } = ctx;
  const verticalIds = [
    ...new Set(
      auth.roles.flatMap((role) => (role.verticalId ? [role.verticalId] : [])),
    ),
  ];
  const [profile, verticals] = await Promise.all([
    findUserProfile(ctx.db, auth.userId),
    findVerticalNames(ctx.db, verticalIds),
  ]);
  if (!profile) throw new UnauthenticatedError('UNAUTHENTICATED');
  const names = new Map(verticals.map((row) => [row.id, row]));
  return {
    user: profile,
    roles: auth.roles.map((role) => ({
      role: role.role,
      vertical: role.verticalId ? (names.get(role.verticalId) ?? null) : null,
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
