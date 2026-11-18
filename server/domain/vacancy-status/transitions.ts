import type { VACANCY_STATUSES } from '../../../lib/vacancy-filters';

export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

/** Menu order; the Phase 4 FILLED trigger adds a system-only action here, never a manual one (D130). */
export const VACANCY_STATUS_ACTIONS = [
  'HOLD',
  'RESUME',
  'CANCEL',
  'REOPEN',
] as const;
export type VacancyStatusAction = (typeof VACANCY_STATUS_ACTIONS)[number];

export interface VacancyTransition {
  readonly from: readonly VacancyStatus[];
  readonly to: VacancyStatus;
  readonly permission:
    'vacancy.hold' | 'vacancy.resume' | 'vacancy.cancel' | 'vacancy.reopen';
  /** Statuses where repeating the action is a no-op answer, not a conflict. */
  readonly repeatOn: readonly VacancyStatus[];
}

/** DRAFT is author-only and CANCELLED is final (D130-4), so neither is ever a `from`; CANCEL on CANCELLED is a conflict, not a repeat. */
export const VACANCY_TRANSITIONS: Readonly<
  Record<VacancyStatusAction, VacancyTransition>
> = {
  HOLD: {
    from: ['OPEN'],
    to: 'ON_HOLD',
    permission: 'vacancy.hold',
    repeatOn: ['ON_HOLD'],
  },
  RESUME: {
    from: ['ON_HOLD'],
    to: 'OPEN',
    permission: 'vacancy.resume',
    repeatOn: ['OPEN'],
  },
  CANCEL: {
    from: ['OPEN', 'ON_HOLD'],
    to: 'CANCELLED',
    permission: 'vacancy.cancel',
    repeatOn: [],
  },
  REOPEN: {
    from: ['FILLED'],
    to: 'OPEN',
    permission: 'vacancy.reopen',
    repeatOn: ['OPEN'],
  },
};

/** Target status when the action is legal from `status`, else null. */
export function transitionTarget(
  status: VacancyStatus,
  action: VacancyStatusAction,
): VacancyStatus | null {
  const transition = VACANCY_TRANSITIONS[action];
  return transition.from.includes(status) ? transition.to : null;
}

/** Actions legal from `status`, in menu order; the authz layer then filters by actor. */
export const actionsFrom = (
  status: VacancyStatus,
): readonly VacancyStatusAction[] =>
  VACANCY_STATUS_ACTIONS.filter(
    (action) => transitionTarget(status, action) !== null,
  );

/** Idempotent repeat: HOLD on ON_HOLD, RESUME on OPEN, REOPEN on OPEN. */
export const isRepeat = (
  status: VacancyStatus,
  action: VacancyStatusAction,
): boolean => VACANCY_TRANSITIONS[action].repeatOn.includes(status);
