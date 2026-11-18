import type { AuthContext } from './context';
import type { PermissionCode } from './permissions';
import type { VacancyRef, VerticalId } from './types';
import { grantCovers, grantedVerticals } from './vacancy-author';

type Facts = Pick<VacancyRef, 'verticalId' | 'status'>;

/** A GLOBAL or VERTICAL grant covering the vertical; the Team Lead's OWN grants and the Recruiter's UNASSIGNED_OPEN grant never count. */
export function hasGrantCovering(
  ctx: AuthContext,
  permission: PermissionCode,
  verticalId: VerticalId,
): boolean {
  return (ctx.grants.get(permission) ?? []).some(
    (grant) =>
      (grant.scope.kind === 'GLOBAL' || grant.scope.kind === 'VERTICAL') &&
      (grant.verticalIds === 'ALL' || grant.verticalIds.includes(verticalId)),
  );
}

/** An OWN grant covering the vertical, valid only on a vacancy whose Team Lead is the caller. */
export function hasOwnGrant(
  ctx: AuthContext,
  permission: PermissionCode,
  verticalId: VerticalId,
  teamLeadId: string | null,
): boolean {
  return (
    teamLeadId !== null &&
    teamLeadId === ctx.userId &&
    (ctx.grants.get(permission) ?? []).some(
      (grant) =>
        grant.scope.kind === 'OWN' &&
        (grant.verticalIds === 'ALL' || grant.verticalIds.includes(verticalId)),
    )
  );
}

/** The team (recruiters, Team Lead) changes only while the vacancy is live; a closed or draft vacancy has no team controls. */
export const isTeamEditable = (status: Facts['status']): boolean =>
  status === 'OPEN' || status === 'ON_HOLD';

/** D1/D130: self-claim is the Recruiter's grant on an `OPEN` vacancy nobody works on yet. */
export const canSelfAssign = (
  ctx: AuthContext,
  vacancy: Facts & { readonly recruiters: readonly unknown[] },
): boolean =>
  grantCovers(ctx, 'vacancy.self_assign', vacancy.verticalId) &&
  vacancy.status === 'OPEN' &&
  vacancy.recruiters.length === 0;

/** Verticals where the caller may claim a free vacancy, for the list page: a row carries no per-viewer flag, so the server sends this once and the row applies the same status and recruiter rule. */
export function selfAssignVerticals(ctx: AuthContext): 'ALL' | string[] {
  const set = grantedVerticals(ctx, 'vacancy.self_assign');
  return set === 'ALL' ? 'ALL' : [...set];
}

export const canAssignRecruiters = (
  ctx: AuthContext,
  vacancy: Facts,
): boolean =>
  hasGrantCovering(ctx, 'vacancy.assign_recruiters', vacancy.verticalId) &&
  isTeamEditable(vacancy.status);

/** D130-3: only the first Team Lead assignment exists in Phase 2. */
export const canSetTeamLead = (
  ctx: AuthContext,
  vacancy: Facts & { readonly teamLead: unknown },
): boolean =>
  hasGrantCovering(ctx, 'vacancy.team_lead.set', vacancy.verticalId) &&
  isTeamEditable(vacancy.status) &&
  vacancy.teamLead === null;
