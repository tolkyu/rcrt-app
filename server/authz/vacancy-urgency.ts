import { isUrgencyChangeable } from '../../lib/vacancy-urgency';
import type { AuthContext } from './context';
import { hasGrantCovering } from './vacancy-assignment';
import type { VacancyRef, VerticalId } from './types';

/** D94: the Team Lead's own `vacancy.update` grant (scope OWN) never counts; only a GLOBAL or VERTICAL grant covering the vertical does. */
export const hasBroadUpdate = (ctx: AuthContext, verticalId: VerticalId) =>
  hasGrantCovering(ctx, 'vacancy.update', verticalId);

export const canChangeUrgency = (
  ctx: AuthContext,
  vacancy: Pick<VacancyRef, 'verticalId' | 'status'>,
): boolean =>
  hasBroadUpdate(ctx, vacancy.verticalId) &&
  isUrgencyChangeable(vacancy.status);
