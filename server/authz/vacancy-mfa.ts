import type { AuthContext } from './context';
import type { VacancyRef } from './types';
import { canAssignRecruiters, canSetTeamLead } from './vacancy-assignment';
import { permittedStatusActions } from './vacancy-status';

type Facts = Pick<VacancyRef, 'verticalId' | 'status'> & {
  readonly teamLead: { readonly id: string } | null;
};

/** The same context with the aal2-only grants active, so the existing predicates answer what a step-up would unlock. */
const afterStepUp = (ctx: AuthContext): AuthContext => {
  const grants = new Map(ctx.grants);
  for (const [permission, withheld] of ctx.mfaWithheldGrants) {
    grants.set(permission, [...(grants.get(permission) ?? []), ...withheld]);
  }
  return { ...ctx, grants, mfaWithheldGrants: new Map() };
};

/**
 * D63: a team or status control the viewer lacks now but a withheld grant (Admin is global, so aal2-only) would give.
 * Judged per vacancy, because a covering vertical grant already held at aal1 leaves nothing to unlock.
 */
export function needsMfa(ctx: AuthContext, vacancy: Facts): boolean {
  if (ctx.mfaWithheldGrants.size === 0) return false;
  const later = afterStepUp(ctx);
  const facts = { ...vacancy, teamLeadId: vacancy.teamLead?.id ?? null };
  return (
    (canAssignRecruiters(later, vacancy) &&
      !canAssignRecruiters(ctx, vacancy)) ||
    (canSetTeamLead(later, vacancy) && !canSetTeamLead(ctx, vacancy)) ||
    permittedStatusActions(later, facts).length >
      permittedStatusActions(ctx, facts).length
  );
}
