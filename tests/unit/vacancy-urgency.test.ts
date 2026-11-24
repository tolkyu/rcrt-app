import { describe, expect, it } from 'vitest';
import { setVacancyUrgencySchema } from '@/lib/schemas/vacancy';
import { VACANCY_PRIORITIES, VACANCY_STATUSES } from '@/lib/vacancy-filters';
import {
  CLOSED_VACANCY_STATUSES,
  isUrgencyChangeable,
  isUrgentHighlighted,
} from '@/lib/vacancy-urgency';
import { EVENT_PAYLOADS } from '@/server/events';

describe('urgency rules [STORY-VAC-08-2, STORY-VAC-04-4, D97, D127]', () => {
  it.each(
    VACANCY_STATUSES.flatMap((status) =>
      VACANCY_PRIORITIES.map((priority) => ({ status, priority })),
    ),
  )('$priority $status', ({ status, priority }) => {
    expect(isUrgentHighlighted({ status, priority })).toBe(
      priority === 'URGENT' && !['FILLED', 'CANCELLED'].includes(status),
    );
  });

  it.each([
    ['DRAFT', false],
    ['OPEN', true],
    ['ON_HOLD', true],
    ['FILLED', false],
    ['CANCELLED', false],
  ] as const)('%s changeable: %s', (status, expected) => {
    expect(isUrgencyChangeable(status)).toBe(expected);
  });

  it('names exactly the two closed statuses', () => {
    expect([...CLOSED_VACANCY_STATUSES]).toEqual(['FILLED', 'CANCELLED']);
  });
});

describe('urgency event payload [SEC-CORE-07]', () => {
  const schema = EVENT_PAYLOADS['vacancy.urgency_changed'];

  it('accepts a change of the flag', () => {
    expect(schema.safeParse({ from: 'NORMAL', to: 'URGENT' }).success).toBe(
      true,
    );
    expect(schema.safeParse({ from: 'URGENT', to: 'NORMAL' }).success).toBe(
      true,
    );
  });

  it.each([
    ['same value', { from: 'URGENT', to: 'URGENT' }],
    ['extra key', { from: 'NORMAL', to: 'URGENT', title: 'x' }],
    ['unknown value', { from: 'NORMAL', to: 'ASAP' }],
    ['missing side', { to: 'URGENT' }],
  ])('rejects %s', (_name, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });
});

describe('urgency request schema', () => {
  it('requires the version and a known value', () => {
    expect(
      setVacancyUrgencySchema.safeParse({
        priority: 'URGENT',
        expectedVersion: 3,
      }).success,
    ).toBe(true);
    for (const body of [
      { priority: 'URGENT' },
      { expectedVersion: 3 },
      { priority: 'ASAP', expectedVersion: 3 },
      { priority: 'URGENT', expectedVersion: 0 },
      { priority: 'URGENT', expectedVersion: 1.5 },
    ])
      expect(
        setVacancyUrgencySchema.safeParse(body).success,
        String(body),
      ).toBe(false);
  });

  it.each(['status', 'teamLeadId', 'probationDays', 'bonus'])(
    'rejects the extra key %s so only urgency is written',
    (key) => {
      expect(
        setVacancyUrgencySchema.safeParse({
          priority: 'URGENT',
          expectedVersion: 1,
          [key]: 'x',
        }).success,
      ).toBe(false);
    },
  );
});
