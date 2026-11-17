import type { VACANCY_PRIORITIES, VACANCY_STATUSES } from './vacancy-filters';

type VacancyStatus = (typeof VACANCY_STATUSES)[number];
type VacancyPriority = (typeof VACANCY_PRIORITIES)[number];

/** VAC-02 only, never dates: one definition of «closed» for the server rule and the red highlight. */
export const CLOSED_VACANCY_STATUSES = [
  'FILLED',
  'CANCELLED',
] as const satisfies readonly VacancyStatus[];

const closed: ReadonlySet<VacancyStatus> = new Set(CLOSED_VACANCY_STATUSES);
const changeable: ReadonlySet<VacancyStatus> = new Set(['OPEN', 'ON_HOLD']);

/** D97: urgency stops being actionable once a vacancy is closed, so only the red styling (not the label) depends on status. */
export const isUrgentHighlighted = (vacancy: {
  readonly priority: VacancyPriority;
  readonly status: VacancyStatus;
}): boolean => vacancy.priority === 'URGENT' && !closed.has(vacancy.status);

/** D127: only a published, still-open vacancy changes urgency; a draft changes it through its own edit. */
export const isUrgencyChangeable = (status: VacancyStatus): boolean =>
  changeable.has(status);
