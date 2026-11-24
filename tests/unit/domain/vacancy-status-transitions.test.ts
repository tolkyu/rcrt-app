import { describe, expect, it } from 'vitest';
import { VACANCY_STATUSES } from '@/lib/vacancy-filters';
import {
  VACANCY_STATUS_ACTIONS,
  VACANCY_TRANSITIONS,
  actionsFrom,
  isRepeat,
  transitionTarget,
  type VacancyStatus,
  type VacancyStatusAction,
} from '@/server/domain/vacancy-status/transitions';

const LEGAL: Readonly<
  Record<VacancyStatusAction, Partial<Record<VacancyStatus, VacancyStatus>>>
> = {
  HOLD: { OPEN: 'ON_HOLD' },
  RESUME: { ON_HOLD: 'OPEN' },
  CANCEL: { OPEN: 'CANCELLED', ON_HOLD: 'CANCELLED' },
  REOPEN: { FILLED: 'OPEN' },
};

const REPEATS: ReadonlyArray<readonly [VacancyStatus, VacancyStatusAction]> = [
  ['ON_HOLD', 'HOLD'],
  ['OPEN', 'RESUME'],
  ['OPEN', 'REOPEN'],
];

const pairs = VACANCY_STATUSES.flatMap((status) =>
  VACANCY_STATUS_ACTIONS.map((action) => [status, action] as const),
);

describe('vacancy status table [STORY-VAC-02-1, D130-4]', () => {
  it('covers 5 statuses x 4 actions', () => {
    expect(pairs).toHaveLength(20);
  });

  it.each(pairs)('%s + %s', (status, action) => {
    expect(transitionTarget(status, action)).toBe(
      LEGAL[action][status] ?? null,
    );
    expect(isRepeat(status, action)).toBe(
      REPEATS.some(([s, a]) => s === status && a === action),
    );
  });

  it.each(VACANCY_STATUSES)(
    '%s offers exactly the legal actions in menu order',
    (status) => {
      expect(actionsFrom(status)).toEqual(
        VACANCY_STATUS_ACTIONS.filter((action) => LEGAL[action][status]),
      );
    },
  );

  it.each(['DRAFT', 'CANCELLED'] as const)('%s offers nothing', (status) => {
    expect(actionsFrom(status)).toEqual([]);
  });

  it('CANCELLED never reopens and no action leads to FILLED', () => {
    for (const action of VACANCY_STATUS_ACTIONS) {
      expect(VACANCY_TRANSITIONS[action].from).not.toContain('CANCELLED');
      expect(VACANCY_TRANSITIONS[action].from).not.toContain('DRAFT');
      expect(VACANCY_TRANSITIONS[action].to).not.toBe('FILLED');
    }
  });

  it('CANCEL on a cancelled vacancy is a conflict, not a repeat', () => {
    expect(isRepeat('CANCELLED', 'CANCEL')).toBe(false);
    expect(transitionTarget('CANCELLED', 'CANCEL')).toBeNull();
  });

  it('a repeat is never a legal transition', () => {
    for (const [status, action] of REPEATS)
      expect(transitionTarget(status, action)).toBeNull();
  });
});
