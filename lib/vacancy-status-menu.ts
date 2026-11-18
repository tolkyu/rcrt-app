import {
  actionsFrom,
  type VacancyStatusAction,
} from '../server/domain/vacancy-status/transitions';
import type { VacancySummary } from './schemas/vacancy';

/** Verticals where a grant applies: `ALL` or the ids. */
export type StatusVerticals = 'ALL' | readonly string[];

/**
 * The viewer's status grants per vertical, decided on the server and sent with the list page (a row carries no per-viewer flag).
 * `covering` = GLOBAL and VERTICAL grants; `own` = the Team Lead's grants, valid only on a row he leads.
 */
export interface StatusGrantMirror {
  readonly viewerId: string;
  readonly covering: Readonly<Record<VacancyStatusAction, StatusVerticals>>;
  readonly own: Readonly<Record<VacancyStatusAction, StatusVerticals>>;
}

const covers = (verticals: StatusVerticals, id: string) =>
  verticals === 'ALL' || verticals.includes(id);

/** Client twin of `permittedStatusActions` (server/authz/vacancy-status.ts); the service decides every write again. */
export function rowStatusActions(
  row: Pick<VacancySummary, 'status' | 'vertical' | 'teamLead'>,
  mirror: StatusGrantMirror | null,
): readonly VacancyStatusAction[] {
  if (!mirror) return [];
  const leads = row.teamLead?.id === mirror.viewerId;
  return actionsFrom(row.status).filter(
    (action) =>
      covers(mirror.covering[action], row.vertical.id) ||
      (leads && covers(mirror.own[action], row.vertical.id)),
  );
}
