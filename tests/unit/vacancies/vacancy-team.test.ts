import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { canClaimRow, grantsClaim } from '@/lib/vacancy-claim';
import {
  attemptTeamWrite,
  classifyTeamFailure,
  type TeamFailure,
} from '@/lib/vacancy-team';
import { ID, json, stubApi, vacancy } from '../../support/team-harness';

afterEach(() => vi.unstubAllGlobals());

describe('classifyTeamFailure [ADR-017 errata E1-E3]', () => {
  const invalid = [{ path: 'body.recruiterIds', code: 'invalid_recruiter' }];
  it.each<[unknown, TeamFailure]>([
    [new ApiError(409, 'STALE_STATE'), 'stale'],
    [new ApiError(409, 'VACANCY_CLOSED'), 'closed'],
    [new ApiError(409, 'VACANCY_ALREADY_ASSIGNED'), 'taken'],
    [new ApiError(409, 'TEAM_LEAD_ALREADY_SET'), 'teamLeadSet'],
    [new ApiError(409, 'SOMETHING_NEW'), 'failed'],
    [new ApiError(400, 'VALIDATION', invalid), 'invalid'],
    [
      new ApiError(400, 'VALIDATION', [{ path: 'body', code: 'too_big' }]),
      'failed',
    ],
    [new ApiError(401, 'UNAUTHENTICATED'), 'forbidden'],
    [new ApiError(403, 'FORBIDDEN'), 'forbidden'],
    [new ApiError(404, 'NOT_FOUND'), 'gone'],
    [new ApiError(429, 'RATE_LIMITED'), 'rateLimited'],
    [new ApiError(500, 'INTERNAL'), 'failed'],
    [new TypeError('Failed to fetch'), 'network'],
  ])('%o → %s', (error, expected) => {
    expect(classifyTeamFailure(error)).toBe(expected);
  });
});

describe('claim visibility of a list row [D130-2, D130-5]', () => {
  const vertical = { id: 'v1', name: 'Гемблінг' };
  const row = (status: string, recruiters: unknown[]) => ({
    status: status as 'OPEN',
    recruiters: recruiters as never[],
    vertical,
  });
  it.each([
    ['free OPEN row of a granted vertical', 'OPEN', [], ['v1'], true],
    ['all verticals granted', 'OPEN', [], 'ALL', true],
    ['another vertical', 'OPEN', [], ['v2'], false],
    ['no grant', 'OPEN', [], [], false],
    ['ON_HOLD', 'ON_HOLD', [], ['v1'], false],
    ['FILLED', 'FILLED', [], ['v1'], false],
    ['already staffed', 'OPEN', [{}], ['v1'], false],
  ] as const)('%s', (_name, status, recruiters, verticals, expected) => {
    expect(canClaimRow(row(status, [...recruiters]), verticals)).toBe(expected);
  });

  it('keeps the host mounted for a granted vertical even after the row is staffed', () => {
    expect(grantsClaim({ vertical }, ['v1'])).toBe(true);
    expect(grantsClaim({ vertical }, [])).toBe(false);
  });
});

describe('attemptTeamWrite', () => {
  const person = {
    id: crypto.randomUUID(),
    fullName: 'Оксана',
    isActive: true,
  };
  const setup = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.vacancy(ID), vacancy());
    return queryClient;
  };

  it('writes the answer to the card and to the rows of every cached list', async () => {
    const queryClient = setup();
    const page: VacancyPage = {
      items: [
        { ...vacancy(), id: ID },
        { ...vacancy(), id: crypto.randomUUID() },
      ],
      nextCursor: null,
      prevCursor: null,
    };
    queryClient.setQueryData(queryKeys.vacancies({ limit: 25 }), page);
    queryClient.setQueryData(queryKeys.vacancyDraftCount(), { count: 2 });
    const answer = vacancy({ recruiters: [person], version: 2 });
    const outcome = await attemptTeamWrite(queryClient, ID, () =>
      Promise.resolve(answer),
    );
    expect(outcome).toEqual({ ok: true, detail: answer });
    expect(
      queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID))?.version,
    ).toBe(2);
    const rows = queryClient.getQueryData<VacancyPage>(
      queryKeys.vacancies({ limit: 25 }),
    )?.items;
    expect(rows?.[0]?.recruiters).toEqual([person]);
    expect(rows?.[1]?.recruiters).toEqual([]);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 2,
    });
  });

  it('judges a stale answer by the current card: adopted only when the predicate says our write is there', async () => {
    const stale = () => Promise.reject(new ApiError(409, 'STALE_STATE'));
    const current = vacancy({ recruiters: [person], version: 2 });
    for (const [adopted, expected] of [
      [() => true, true],
      [() => false, false],
    ] as const) {
      const queryClient = setup();
      stubApi({ [`GET /vacancies/${ID}`]: () => json(current) });
      const outcome = await attemptTeamWrite(queryClient, ID, stale, adopted);
      expect(outcome.ok).toBe(expected);
      if (!outcome.ok) expect(outcome.failure).toBe('stale');
    }
  });

  it('returns the failure kind without touching the cache on a lost connection', async () => {
    const queryClient = setup();
    const outcome = await attemptTeamWrite(queryClient, ID, () =>
      Promise.reject(new TypeError('offline')),
    );
    expect(outcome).toEqual({ ok: false, failure: 'network' });
    expect(
      queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID))?.version,
    ).toBe(1);
  });
});
