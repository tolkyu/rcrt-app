import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { toggleStatus } from '@/lib/vacancy-status-change';
import { classifyTeamFailure } from '@/lib/vacancy-team';
import { SHARE_ID, shareVacancy } from '../../support/vacancy-share-harness';

const LIST = vacanciesQuery({ status: 'OPEN' }).queryKey;
const card = (): VacancyDetail =>
  shareVacancy({ statusActions: ['HOLD', 'CANCEL'], version: 3 });
const page = (): VacancyPage => {
  const { id, number, title, vertical, position, teamLead, recruiters } =
    card();
  const { status, priority, source, openedAt, createdAt, updatedAt } = card();
  return {
    items: [
      {
        id,
        number,
        title,
        vertical,
        position,
        teamLead,
        recruiters,
        status,
        priority,
        source,
        openedAt,
        createdAt,
        updatedAt,
      },
    ],
    nextCursor: null,
    prevCursor: null,
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('toggleStatus: the cache while the request is in flight', () => {
  it('flips the card, its action list and the cached rows, and puts them back on failure', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.vacancy(SHARE_ID), card());
    client.setQueryData(LIST, page());
    let seen: { card?: VacancyDetail; row?: string } = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        seen = {
          card: client.getQueryData<VacancyDetail>(queryKeys.vacancy(SHARE_ID)),
          row: client.getQueryData<VacancyPage>(LIST)?.items[0]?.status,
        };
        return Promise.reject(new TypeError('offline'));
      }),
    );
    const outcome = await toggleStatus(client, {
      id: SHARE_ID,
      number: 'V-0005',
      action: 'HOLD',
      version: 3,
      unassigned: true,
    });
    expect(seen.card?.status).toBe('ON_HOLD');
    expect(seen.card?.statusActions).toEqual(['RESUME', 'CANCEL']);
    expect(seen.row).toBe('ON_HOLD');
    expect(outcome).toMatchObject({ status: 'failed', failure: 'network' });
    const back = client.getQueryData<VacancyDetail>(
      queryKeys.vacancy(SHARE_ID),
    );
    expect(back?.status).toBe('OPEN');
    expect(back?.statusActions).toEqual(['HOLD', 'CANCEL']);
    expect(client.getQueryData<VacancyPage>(LIST)?.items[0]?.status).toBe(
      'OPEN',
    );
  });
});

describe('classifyTeamFailure: status answers', () => {
  it('tells an illegal transition from a stale version', () => {
    expect(
      classifyTeamFailure(new ApiError(409, 'VACANCY_STATUS_INVALID')),
    ).toBe('statusInvalid');
    expect(classifyTeamFailure(new ApiError(409, 'STALE_STATE'))).toBe('stale');
  });
});
