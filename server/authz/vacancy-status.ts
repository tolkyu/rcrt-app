import {
  VACANCY_TRANSITIONS,
  actionsFrom,
  type VacancyStatusAction,
} from '../domain/vacancy-status/transitions';
import type { AuthContext } from './context';
import type { PermissionCode } from './permissions';
import type { VacancyRef } from './types';
import { hasGrantCovering, hasOwnGrant } from './vacancy-assignment';

type Facts = Pick<VacancyRef, 'verticalId' | 'status'> & {
  readonly teamLeadId: string | null;
};

/** Grant check only (403); whether the transition is legal from the stored status is the table's call (409). */
export function mayRequestStatusAction(
  ctx: AuthContext,
  vacancy: Pick<Facts, 'verticalId' | 'teamLeadId'>,
  action: VacancyStatusAction,
): boolean {
  const permission: PermissionCode = VACANCY_TRANSITIONS[action].permission;
  return (
    hasGrantCovering(ctx, permission, vacancy.verticalId) ||
    hasOwnGrant(ctx, permission, vacancy.verticalId, vacancy.teamLeadId)
  );
}

/** What the card menu offers this viewer: legal from the status and granted. */
export const permittedStatusActions = (
  ctx: AuthContext,
  vacancy: Facts,
): VacancyStatusAction[] =>
  actionsFrom(vacancy.status).filter((action) =>
    mayRequestStatusAction(ctx, vacancy, action),
  );
