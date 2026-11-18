import type {
  StatusGrantMirror,
  StatusVerticals,
} from '../../lib/vacancy-status-menu';
import {
  VACANCY_TRANSITIONS,
  actionsFrom,
  type VacancyStatusAction,
} from '../domain/vacancy-status/transitions';
import type { AuthContext } from './context';
import type { PermissionCode } from './permissions';
import type { ScopeKind, VacancyRef } from './types';
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

function verticalsOf(
  ctx: AuthContext,
  permission: PermissionCode,
  kinds: readonly ScopeKind[],
): StatusVerticals {
  const ids = new Set<string>();
  for (const grant of ctx.grants.get(permission) ?? []) {
    if (!kinds.includes(grant.scope.kind)) continue;
    if (grant.verticalIds === 'ALL') return 'ALL';
    for (const id of grant.verticalIds) ids.add(id);
  }
  return [...ids];
}

const perAction = (
  ctx: AuthContext,
  kinds: readonly ScopeKind[],
): StatusGrantMirror['covering'] => ({
  HOLD: verticalsOf(ctx, VACANCY_TRANSITIONS.HOLD.permission, kinds),
  RESUME: verticalsOf(ctx, VACANCY_TRANSITIONS.RESUME.permission, kinds),
  CANCEL: verticalsOf(ctx, VACANCY_TRANSITIONS.CANCEL.permission, kinds),
  REOPEN: verticalsOf(ctx, VACANCY_TRANSITIONS.REOPEN.permission, kinds),
});

const isEmpty = (verticals: StatusVerticals) =>
  verticals !== 'ALL' && verticals.length === 0;

/** Per-vertical mirror of `mayRequestStatusAction` for the list page; the own-grant half is applied by the row against its Team Lead. `null` when the viewer holds no status grant at all, so such a list ships and loads nothing. */
export function statusGrantMirror(ctx: AuthContext): StatusGrantMirror | null {
  const covering = perAction(ctx, ['GLOBAL', 'VERTICAL']);
  const own = perAction(ctx, ['OWN']);
  const none = [...Object.values(covering), ...Object.values(own)].every(
    isEmpty,
  );
  return none ? null : { viewerId: ctx.userId, covering, own };
}

/** What the card menu offers this viewer: legal from the status and granted. */
export const permittedStatusActions = (
  ctx: AuthContext,
  vacancy: Facts,
): VacancyStatusAction[] =>
  actionsFrom(vacancy.status).filter((action) =>
    mayRequestStatusAction(ctx, vacancy, action),
  );
