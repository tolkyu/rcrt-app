import { isUrgencyChangeable } from '../../lib/vacancy-urgency';
import type { AuthContext } from './context';
import type { VacancyRef, VerticalId } from './types';

/** D94: the Team Lead's own `vacancy.update` grant (scope OWN) never counts; only a GLOBAL or VERTICAL grant covering the vertical does. */
export function hasBroadUpdate(
  ctx: AuthContext,
  verticalId: VerticalId,
): boolean {
  return (ctx.grants.get('vacancy.update') ?? []).some(
    (grant) =>
      (grant.scope.kind === 'GLOBAL' || grant.scope.kind === 'VERTICAL') &&
      (grant.verticalIds === 'ALL' || grant.verticalIds.includes(verticalId)),
  );
}

export const canChangeUrgency = (
  ctx: AuthContext,
  vacancy: Pick<VacancyRef, 'verticalId' | 'status'>,
): boolean =>
  hasBroadUpdate(ctx, vacancy.verticalId) &&
  isUrgencyChangeable(vacancy.status);
