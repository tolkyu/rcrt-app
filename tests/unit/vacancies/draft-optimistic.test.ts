import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { applyOptimisticPublish } from '@/lib/vacancy-draft-optimistic';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const B = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const C = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

// The keys the list really uses: filters pass through `vacancyApiFilters`.
const DRAFTS = vacanciesQuery({ status: 'DRAFT', vertical: VERTICAL }).queryKey;
const OPEN = vacanciesQuery({ status: 'OPEN', vertical: VERTICAL }).queryKey;
const SEARCH = vacanciesQuery({
  status: 'DRAFT',
  vertical: VERTICAL,
  q: 'Медіабаєр',
}).queryKey;
const COUNT = queryKeys.vacancyDraftCount();

const summary = (id: string, number: string): VacancyPage['items'][number] => ({
  id,
  number,
  title: `Медіабаєр — Facebook ${number}`,
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: { id: POSITION, name: 'Медіабаєр' },
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
});
const detail = (
  id: string,
  number: string,
  status: VacancyDetail['status'] = 'DRAFT',
): VacancyDetail => ({
  ...summary(id, number),
  status,
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
  canChangeUrgency: false,
  canSelfAssign: false,
  canAssignRecruiters: false,
  canSetTeamLead: false,
  statusActions: [],
});
const page = (...rows: [string, string][]): VacancyPage => ({
  items: rows.map(([id, number]) => summary(id, number)),
  nextCursor: null,
  prevCursor: null,
});

function setup() {
  const client = new QueryClient();
  client.setQueryData(
    DRAFTS,
    page([A, 'V-0015'], [B, 'V-0014'], [C, 'V-0013']),
  );
  client.setQueryData(OPEN, page([B, 'V-0012']));
  client.setQueryData(COUNT, { count: 4 });
  client.setQueryData(queryKeys.vacancy(A), detail(A, 'V-0015'));
  client.setQueryData(queryKeys.vacancy(B), detail(B, 'V-0014'));
  return client;
}
const ids = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryData<VacancyPage>(key)?.items.map((item) => item.id);
const count = (client: QueryClient) =>
  client.getQueryData<{ count: number }>(COUNT)?.count;
const status = (client: QueryClient, id: string) =>
  client.getQueryData<VacancyDetail>(queryKeys.vacancy(id))?.status;
const snapshot = (client: QueryClient) =>
  JSON.stringify(
    client
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  );

describe('applyOptimisticPublish', () => {
  it('drops the row from every list that holds it, counts one less and opens the card; restore puts it all back', () => {
    const client = setup();
    client.setQueryData(SEARCH, page([A, 'V-0015']));
    const before = snapshot(client);
    const optimistic = applyOptimisticPublish(client, A);
    expect(ids(client, DRAFTS)).toEqual([B, C]);
    expect(ids(client, SEARCH)).toEqual([]);
    expect(ids(client, OPEN)).toEqual([B]);
    expect(count(client)).toBe(3);
    expect(status(client, A)).toBe('OPEN');
    optimistic.restore();
    expect(snapshot(client)).toBe(before);
  });

  it('the count never goes below zero and gives back nothing it did not take; a missing count stays missing', () => {
    const client = setup();
    client.setQueryData(COUNT, { count: 0 });
    const optimistic = applyOptimisticPublish(client, A);
    expect(count(client)).toBe(0);
    optimistic.restore();
    expect(count(client)).toBe(0);
    client.removeQueries({ queryKey: COUNT });
    applyOptimisticPublish(client, A);
    expect(client.getQueryData(COUNT)).toBeUndefined();
  });

  describe('two publishes in flight undo only their own change', () => {
    const overlapped = () => {
      const client = setup();
      const before = snapshot(client);
      const a = applyOptimisticPublish(client, A);
      const b = applyOptimisticPublish(client, B);
      return { client, a, b, before };
    };

    it('both are applied: two rows gone, the count down by two', () => {
      const { client } = overlapped();
      expect(ids(client, DRAFTS)).toEqual([C]);
      expect(count(client)).toBe(2);
    });

    it('A fails, then B: lists, count and both cards are as they were', () => {
      const { client, a, b, before } = overlapped();
      a.restore();
      expect(ids(client, DRAFTS)).toEqual([A, C]);
      expect(count(client)).toBe(3);
      b.restore();
      expect(snapshot(client)).toBe(before);
    });

    it('B fails, then A: the same original state', () => {
      const { client, a, b, before } = overlapped();
      b.restore();
      expect(ids(client, DRAFTS)).toEqual([B, C]);
      a.restore();
      expect(snapshot(client)).toBe(before);
    });

    it('B succeeded and A fails: B stays gone, A is back, the count is one less', () => {
      const { client, a, b } = overlapped();
      b.settle();
      a.restore();
      expect(ids(client, DRAFTS)).toEqual([A, C]);
      expect(count(client)).toBe(3);
      expect(status(client, B)).toBe('OPEN');
    });

    it('a restore never inserts a row twice', () => {
      const { client, a } = overlapped();
      client.setQueryData(DRAFTS, page([A, 'V-0015'], [C, 'V-0013']));
      a.restore();
      expect(ids(client, DRAFTS)).toEqual([A, C]);
    });

    it('a card that left OPEN meanwhile is not forced back to DRAFT', () => {
      const { client, a } = overlapped();
      client.setQueryData(
        queryKeys.vacancy(A),
        detail(A, 'V-0015', 'CANCELLED'),
      );
      a.restore();
      expect(status(client, A)).toBe('CANCELLED');
    });
  });

  describe('a refetch while the publish is in flight', () => {
    it('the server still holds the draft: the row, the count and the card are taken out again, and restore still balances', async () => {
      const client = setup();
      const optimistic = applyOptimisticPublish(client, A);
      await client.fetchQuery({
        queryKey: DRAFTS,
        staleTime: 0,
        queryFn: () => page([A, 'V-0015'], [B, 'V-0014'], [C, 'V-0013']),
      });
      await client.fetchQuery({
        queryKey: COUNT,
        staleTime: 0,
        queryFn: () => ({ count: 4 }),
      });
      await client.fetchQuery({
        queryKey: queryKeys.vacancy(A),
        staleTime: 0,
        queryFn: () => detail(A, 'V-0015'),
      });
      expect(ids(client, DRAFTS)).toEqual([B, C]);
      expect(count(client)).toBe(3);
      expect(status(client, A)).toBe('OPEN');
      optimistic.restore();
      expect(ids(client, DRAFTS)).toEqual([A, B, C]);
      expect(count(client)).toBe(4);
    });

    it('the server already published it: an OPEN list keeps the row, a count that excludes it is not lowered again', async () => {
      const client = setup();
      const optimistic = applyOptimisticPublish(client, A);
      const published = { ...summary(A, 'V-0015'), status: 'OPEN' as const };
      await client.fetchQuery({
        queryKey: OPEN,
        staleTime: 0,
        queryFn: () => ({
          items: [published],
          nextCursor: null,
          prevCursor: null,
        }),
      });
      expect(ids(client, OPEN)).toEqual([A]);
      await client.fetchQuery({
        queryKey: COUNT,
        staleTime: 0,
        queryFn: () => ({ count: 3 }),
      });
      expect(count(client)).toBe(3);
      await client.fetchQuery({
        queryKey: COUNT,
        staleTime: 0,
        queryFn: () => ({ count: 2 }),
      });
      expect(count(client)).toBe(2);
      optimistic.settle();
    });

    it('after settle the server answer is taken as it is', async () => {
      const client = setup();
      applyOptimisticPublish(client, A).settle();
      await client.fetchQuery({
        queryKey: DRAFTS,
        staleTime: 0,
        queryFn: () => page([B, 'V-0014'], [C, 'V-0013']),
      });
      await client.fetchQuery({
        queryKey: COUNT,
        staleTime: 0,
        queryFn: () => ({ count: 3 }),
      });
      expect(ids(client, DRAFTS)).toEqual([B, C]);
      expect(count(client)).toBe(3);
    });
  });
});
