import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import { queryKeys } from '@/lib/query-keys';
import type {
  VacancyDetail,
  VacancyPage,
  VacancySummary,
} from '@/lib/schemas/vacancy';
import { applyOptimisticUrgency } from '@/lib/vacancy-urgency-optimistic';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const B = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

const OPEN = vacanciesQuery({ status: 'OPEN', vertical: VERTICAL }).queryKey;
const HOLD = vacanciesQuery({ status: 'ON_HOLD', vertical: VERTICAL }).queryKey;

const summary = (
  id: string,
  priority: VacancySummary['priority'] = 'NORMAL',
): VacancySummary => ({
  id,
  number: id === A ? 'V-0007' : 'V-0008',
  title: 'Медіабаєр — Facebook',
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'OPEN',
  priority,
  source: 'APP',
  openedAt: '2026-10-22T09:00:00.000Z',
  createdAt: '2026-10-18T09:00:00.000Z',
  updatedAt: '2026-10-22T09:00:00.000Z',
});
const detail = (
  id: string,
  priority: VacancySummary['priority'] = 'NORMAL',
): VacancyDetail => ({
  ...summary(id, priority),
  headcount: 1,
  seniority: null,
  workFormat: null,
  employmentType: null,
  location: null,
  salaryMinMinor: null,
  salaryMaxMinor: null,
  salaryCurrency: null,
  probationDays: 90,
  recruiterInitiated: true,
  version: 3,
  canChangeUrgency: true,
});
const page = (...rows: VacancySummary[]): VacancyPage => ({
  items: rows,
  nextCursor: null,
  prevCursor: null,
});
const priorities = (client: QueryClient, key: readonly unknown[]) =>
  client
    .getQueryData<VacancyPage>(key)
    ?.items.map((row) => `${row.id.slice(0, 1)}:${row.priority}`);
const card = (client: QueryClient, id: string) =>
  client.getQueryData<VacancyDetail>(queryKeys.vacancy(id))?.priority;

function setup() {
  const client = new QueryClient();
  client.setQueryData(OPEN, page(summary(A), summary(B)));
  client.setQueryData(HOLD, page(summary(A)));
  client.setQueryData(queryKeys.vacancy(A), detail(A));
  client.setQueryData(queryKeys.vacancy(B), detail(B));
  return client;
}

/** A refetch result as the network cache write: not `manual`. */
const refetched = (
  client: QueryClient,
  key: readonly unknown[],
  data: unknown,
) => {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  query?.setData(data, { manual: false });
};

describe('applyOptimisticUrgency [STORY-VAC-08-2, D94]', () => {
  it('flips the card and every cached row of that vacancy and nothing else', () => {
    const client = setup();
    applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    expect(card(client, A)).toBe('URGENT');
    expect(card(client, B)).toBe('NORMAL');
    expect(priorities(client, OPEN)).toEqual(['0:URGENT', '1:NORMAL']);
    expect(priorities(client, HOLD)).toEqual(['0:URGENT']);
  });

  it('keeps the version: only the server answer moves it', () => {
    const client = setup();
    applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    expect(
      client.getQueryData<VacancyDetail>(queryKeys.vacancy(A))?.version,
    ).toBe(3);
  });

  it('restore puts back the card and the rows', () => {
    const client = setup();
    const change = applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    change.restore();
    expect(card(client, A)).toBe('NORMAL');
    expect(priorities(client, OPEN)).toEqual(['0:NORMAL', '1:NORMAL']);
    expect(priorities(client, HOLD)).toEqual(['0:NORMAL']);
  });

  it('a cache without the card or the lists is left alone', () => {
    const client = new QueryClient();
    const change = applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    change.restore();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it.each([
    ['first failing first', ['a', 'b']],
    ['second failing first', ['b', 'a']],
  ] as const)(
    'two overlapping changes that both fail undo only their own vacancy (%s)',
    (_name, order) => {
      const client = setup();
      const changes = {
        a: applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT'),
        b: applyOptimisticUrgency(client, B, 'NORMAL', 'URGENT'),
      };
      expect(priorities(client, OPEN)).toEqual(['0:URGENT', '1:URGENT']);
      changes[order[0]].restore();
      const first = order[0] === 'a' ? A : B;
      const other = order[0] === 'a' ? B : A;
      expect(card(client, first)).toBe('NORMAL');
      expect(card(client, other)).toBe('URGENT');
      changes[order[1]].restore();
      expect(priorities(client, OPEN)).toEqual(['0:NORMAL', '1:NORMAL']);
      expect(card(client, A)).toBe('NORMAL');
      expect(card(client, B)).toBe('NORMAL');
    },
  );

  it('restore leaves a row alone that shows another value by now', () => {
    const client = setup();
    const change = applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    client.setQueryData(queryKeys.vacancy(A), detail(A, 'NORMAL'));
    client.setQueryData(OPEN, page(summary(A, 'NORMAL'), summary(B)));
    change.restore();
    expect(card(client, A)).toBe('NORMAL');
    expect(priorities(client, OPEN)).toEqual(['0:NORMAL', '1:NORMAL']);
  });

  it('a refetch that returns the old server state during the flight does not undo it', () => {
    const client = setup();
    applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    refetched(client, queryKeys.vacancy(A), detail(A, 'NORMAL'));
    refetched(client, OPEN, page(summary(A, 'NORMAL'), summary(B)));
    expect(card(client, A)).toBe('URGENT');
    expect(priorities(client, OPEN)).toEqual(['0:URGENT', '1:NORMAL']);
  });

  it('a settled change stops watching: the next refetch is the truth', () => {
    const client = setup();
    const change = applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    change.settle();
    refetched(client, queryKeys.vacancy(A), detail(A, 'NORMAL'));
    expect(card(client, A)).toBe('NORMAL');
  });

  it('a restored change stops watching too', () => {
    const client = setup();
    const change = applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    change.restore();
    refetched(client, queryKeys.vacancy(A), detail(A, 'NORMAL'));
    expect(card(client, A)).toBe('NORMAL');
  });

  it('a refetch of another vacancy is not touched', () => {
    const client = setup();
    applyOptimisticUrgency(client, A, 'NORMAL', 'URGENT');
    refetched(client, queryKeys.vacancy(B), detail(B, 'NORMAL'));
    expect(card(client, B)).toBe('NORMAL');
  });

  it('works back from urgent to normal', () => {
    const client = new QueryClient();
    client.setQueryData(OPEN, page(summary(A, 'URGENT')));
    client.setQueryData(queryKeys.vacancy(A), detail(A, 'URGENT'));
    const change = applyOptimisticUrgency(client, A, 'URGENT', 'NORMAL');
    expect(card(client, A)).toBe('NORMAL');
    expect(priorities(client, OPEN)).toEqual(['0:NORMAL']);
    change.restore();
    expect(card(client, A)).toBe('URGENT');
    expect(priorities(client, OPEN)).toEqual(['0:URGENT']);
  });
});
