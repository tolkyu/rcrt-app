import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import {
  applyClosed,
  classifyCloseFailure,
  closeDraft,
  closedLandingHref,
  isUnsure,
  refreshDraft,
  type ClosableDraft,
  type CloseFailure,
} from '@/lib/vacancy-draft-close';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

afterEach(() => vi.unstubAllGlobals());

const detail = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: VERTICAL, name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
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
  needsMfa: false,
  ...changes,
});
const draft = (status: ClosableDraft['status'] = 'DRAFT'): ClosableDraft => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  status,
  vertical: { id: VERTICAL },
});
const row = (id: string, status: 'DRAFT' | 'CANCELLED' = 'DRAFT') => {
  const { id: _id, status: _status, ...rest } = detail();
  void _id;
  void _status;
  return { ...rest, id, status };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string) =>
  json(status, { code, errors: [] });

function setup(answers: (Response | Error)[]) {
  const fetchSpy = vi.fn<typeof fetch>();
  for (const answer of answers)
    if (answer instanceof Error) fetchSpy.mockRejectedValueOnce(answer);
    else fetchSpy.mockResolvedValueOnce(answer);
  vi.stubGlobal('fetch', fetchSpy);
  const queryClient = new QueryClient();
  const sent = () =>
    fetchSpy.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
  return { queryClient, sent, fetchSpy };
}

describe('classifyCloseFailure: every answer has one reading', () => {
  const cases: [string, unknown, 'cancel' | 'delete', CloseFailure][] = [
    [
      'not a draft',
      new ApiError(409, 'VACANCY_NOT_DRAFT'),
      'cancel',
      'notDraft',
    ],
    ['stale lock', new ApiError(409, 'STALE_STATE'), 'delete', 'stale'],
    ['gone', new ApiError(404, 'NOT_FOUND'), 'cancel', 'gone'],
    [
      'rate limited',
      new ApiError(429, 'RATE_LIMITED'),
      'delete',
      'rateLimited',
    ],
    ['forbidden', new ApiError(403, 'FORBIDDEN'), 'cancel', 'forbidden'],
    ['bad reason', new ApiError(400, 'VALIDATION_FAILED'), 'cancel', 'invalid'],
    [
      '400 on a delete',
      new ApiError(400, 'VALIDATION_FAILED'),
      'delete',
      'failed',
    ],
    ['server error', new ApiError(500, 'INTERNAL'), 'cancel', 'failed'],
    ['no answer', new TypeError('Failed to fetch'), 'cancel', 'network'],
  ];
  it.each(cases)('%s', (_name, error, kind, expected) => {
    expect(classifyCloseFailure(error, kind)).toBe(expected);
  });

  it('only a failure that may have been applied is unsure', () => {
    expect(
      (
        [
          'invalid',
          'notDraft',
          'stale',
          'gone',
          'rateLimited',
          'forbidden',
          'network',
          'failed',
        ] as const
      ).filter(isUnsure),
    ).toEqual(['network', 'failed']);
  });
});

describe('closeDraft: cancel [D82, D113]', () => {
  it('posts the reason as typed (line breaks kept) and returns the cancelled draft', async () => {
    const { queryClient, sent } = setup([
      json(200, detail({ status: 'CANCELLED', version: 4 })),
    ]);
    const outcome = await closeDraft(
      queryClient,
      'cancel',
      draft(),
      'Дубль\nвакансії',
      false,
    );
    expect(outcome).toMatchObject({
      status: 'done',
      vacancy: { status: 'CANCELLED' },
    });
    expect(sent()).toEqual([
      {
        url: `/api/v1/vacancies/${ID}/cancel`,
        method: 'POST',
        body: { reason: 'Дубль\nвакансії' },
      },
    ]);
  });

  it('a second press while one is out sends nothing', async () => {
    const { queryClient, sent, fetchSpy } = setup([]);
    let answer: (response: Response) => void = () => undefined;
    fetchSpy.mockReturnValueOnce(
      new Promise<Response>((resolve) => (answer = resolve)),
    );
    const first = closeDraft(queryClient, 'cancel', draft(), 'Дубль', false);
    const second = await closeDraft(
      queryClient,
      'cancel',
      draft(),
      'Дубль',
      false,
    );
    expect(second).toEqual({ status: 'busy' });
    answer(json(200, detail({ status: 'CANCELLED' })));
    await first;
    expect(sent()).toHaveLength(1);
  });

  it.each([
    ['409 not a draft', problem(409, 'VACANCY_NOT_DRAFT'), 'notDraft'],
    ['409 stale', problem(409, 'STALE_STATE'), 'stale'],
    ['404', problem(404, 'NOT_FOUND'), 'gone'],
    ['403', problem(403, 'FORBIDDEN'), 'forbidden'],
    ['429', problem(429, 'RATE_LIMITED'), 'rateLimited'],
    ['400', problem(400, 'VALIDATION_FAILED'), 'invalid'],
    ['500', problem(500, 'INTERNAL'), 'failed'],
    ['lost answer', new TypeError('Failed to fetch'), 'network'],
  ] as const)(
    '%s fails as %s and frees the lock',
    async (_name, answer, failure) => {
      const { queryClient, sent } = setup([answer, json(200, detail())]);
      await expect(
        closeDraft(queryClient, 'cancel', draft(), 'Дубль', false),
      ).resolves.toEqual({ status: 'failed', failure });
      // The lock is gone: the next press goes out.
      await closeDraft(queryClient, 'cancel', draft(), 'Дубль', false);
      expect(sent()).toHaveLength(2);
    },
  );

  it('a retry after a lost answer that meets 409 adopts the stored cancelled draft', async () => {
    const stored = detail({ status: 'CANCELLED', version: 4 });
    const { queryClient, sent } = setup([
      problem(409, 'VACANCY_NOT_DRAFT'),
      json(200, stored),
    ]);
    const before = detail();
    queryClient.setQueryData(queryKeys.vacancy(ID), before);
    const outcome = await closeDraft(
      queryClient,
      'cancel',
      draft(),
      'Дубль',
      true,
    );
    expect(outcome).toEqual({ status: 'done', vacancy: stored });
    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toEqual(before);
    expect(sent().map(({ method }) => method)).toEqual(['POST', 'GET']);
  });

  it('the same 409 on a first press is a warning, never a guess', async () => {
    const { queryClient, sent } = setup([problem(409, 'VACANCY_NOT_DRAFT')]);
    await expect(
      closeDraft(queryClient, 'cancel', draft(), 'Дубль', false),
    ).resolves.toEqual({ status: 'failed', failure: 'notDraft' });
    expect(sent()).toHaveLength(1);
  });

  it.each([
    [
      'published meanwhile',
      detail({ status: 'OPEN', openedAt: '2026-11-17T09:00:00.000Z' }),
    ],
    [
      'cancelled after it was open',
      detail({ status: 'CANCELLED', openedAt: '2026-11-17T09:00:00.000Z' }),
    ],
  ])(
    'an unsure retry does not adopt a draft that is %s',
    async (_name, stored) => {
      const { queryClient } = setup([
        problem(409, 'VACANCY_NOT_DRAFT'),
        json(200, stored),
      ]);
      await expect(
        closeDraft(queryClient, 'cancel', draft(), 'Дубль', true),
      ).resolves.toEqual({ status: 'failed', failure: 'notDraft' });
    },
  );

  it('an unsure retry whose check cannot be read keeps the conflict', async () => {
    const { queryClient } = setup([
      problem(409, 'VACANCY_NOT_DRAFT'),
      problem(500, 'INTERNAL'),
    ]);
    await expect(
      closeDraft(queryClient, 'cancel', draft(), 'Дубль', true),
    ).resolves.toEqual({ status: 'failed', failure: 'notDraft' });
  });
});

describe('closeDraft: delete [D112(1)]', () => {
  it('sends DELETE without a body and returns no card', async () => {
    const { queryClient, sent } = setup([json(200, { id: ID })]);
    await expect(
      closeDraft(queryClient, 'delete', draft(), '', false),
    ).resolves.toEqual({ status: 'done', vacancy: null });
    expect(sent()).toEqual([
      { url: `/api/v1/vacancies/${ID}`, method: 'DELETE', body: {} },
    ]);
  });

  it('a 404 proves no delete, on a retry or a first press: it can also be lost access', async () => {
    const retry = setup([problem(404, 'NOT_FOUND')]);
    await expect(
      closeDraft(retry.queryClient, 'delete', draft(), '', true),
    ).resolves.toEqual({ status: 'failed', failure: 'gone' });
    const first = setup([problem(404, 'NOT_FOUND')]);
    await expect(
      closeDraft(first.queryClient, 'delete', draft(), '', false),
    ).resolves.toEqual({ status: 'failed', failure: 'gone' });
  });

  it('409 (it was opened) stays a conflict even on a retry', async () => {
    const { queryClient } = setup([problem(409, 'VACANCY_NOT_DRAFT')]);
    await expect(
      closeDraft(queryClient, 'delete', draft('CANCELLED'), '', true),
    ).resolves.toEqual({ status: 'failed', failure: 'notDraft' });
  });
});

describe('applyClosed: the caches after the answer', () => {
  const DRAFT_LIST = vacanciesQuery({
    status: 'DRAFT',
    vertical: VERTICAL,
  }).queryKey;
  const CANCELLED_LIST = vacanciesQuery({
    status: 'CANCELLED',
    vertical: VERTICAL,
  }).queryKey;
  const page = (...items: ReturnType<typeof row>[]): VacancyPage => ({
    items,
    nextCursor: null,
    prevCursor: null,
  });
  const idsOf = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryData<VacancyPage>(key)?.items.map((item) => item.id);

  const allowed = () => true;

  function seeded() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(DRAFT_LIST, page(row(ID), row(OTHER)));
    queryClient.setQueryData(CANCELLED_LIST, page(row(OTHER, 'CANCELLED')));
    queryClient.setQueryData(queryKeys.vacancyDraftCount(), { count: 4 });
    queryClient.setQueryData(queryKeys.vacancy(ID), detail());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    return { queryClient, invalidate };
  }

  it('cancel: the row leaves every list, the count drops by one, the card shows the cancelled draft, everything refreshes', async () => {
    const { queryClient, invalidate } = seeded();
    const cancelled = detail({ status: 'CANCELLED', version: 4 });
    await applyClosed(
      queryClient,
      draft(),
      cancelled,
      () => undefined,
      allowed,
    );
    expect(idsOf(queryClient, DRAFT_LIST)).toEqual([OTHER]);
    expect(idsOf(queryClient, CANCELLED_LIST)).toEqual([OTHER]);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 3,
    });
    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toEqual(cancelled);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
  });

  it('delete of a cancelled draft: the row leaves, the count stays, the card is dropped', async () => {
    const { queryClient } = seeded();
    queryClient.setQueryData(
      CANCELLED_LIST,
      page(row(ID, 'CANCELLED'), row(OTHER, 'CANCELLED')),
    );
    await applyClosed(
      queryClient,
      draft('CANCELLED'),
      null,
      () => undefined,
      allowed,
    );
    expect(idsOf(queryClient, CANCELLED_LIST)).toEqual([OTHER]);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 4,
    });
    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toBeUndefined();
  });

  it('a pending older card answer cannot restore DRAFT after cancellation', async () => {
    const { queryClient } = seeded();
    let resolveOld!: (value: VacancyDetail) => void;
    const oldAnswer = new Promise<VacancyDetail>((resolve) => {
      resolveOld = resolve;
    });
    const oldRead = queryClient.fetchQuery({
      queryKey: queryKeys.vacancy(ID),
      queryFn: () => oldAnswer,
      staleTime: 0,
    });
    // Observe the expected cancellation before applying the successful write.
    const settledRead = oldRead.catch(() => undefined);
    const cancelled = detail({ status: 'CANCELLED', version: 4 });

    await applyClosed(
      queryClient,
      draft(),
      cancelled,
      () => undefined,
      allowed,
    );
    resolveOld(detail());
    await settledRead;
    await oldAnswer;

    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toEqual(cancelled);
    expect(queryClient.getQueryState(queryKeys.vacancy(ID))?.fetchStatus).toBe(
      'idle',
    );
  });

  it('delete of a draft: the count drops and the card is dropped', async () => {
    const { queryClient } = seeded();
    await applyClosed(queryClient, draft(), null, () => undefined, allowed);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 3,
    });
    expect(queryClient.getQueryData(queryKeys.vacancy(ID))).toBeUndefined();
  });

  it('the neighbour is chosen while the row is still on the page', async () => {
    const { queryClient } = seeded();
    const seen: (string[] | undefined)[] = [];
    await applyClosed(
      queryClient,
      draft(),
      null,
      () => seen.push(idsOf(queryClient, DRAFT_LIST)),
      allowed,
    );
    expect(seen).toEqual([[ID, OTHER]]);
  });

  it('the count never goes below zero, and an uncached count is left alone', async () => {
    const { queryClient } = seeded();
    queryClient.setQueryData(queryKeys.vacancyDraftCount(), { count: 0 });
    await applyClosed(queryClient, draft(), null, () => undefined, allowed);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 0,
    });
    const bare = new QueryClient();
    await applyClosed(bare, draft(), null, () => undefined, allowed);
    expect(bare.getQueryData(queryKeys.vacancyDraftCount())).toBeUndefined();
  });

  it('a list refetch that was already out when the answer came is cancelled first', async () => {
    const { queryClient } = seeded();
    const cancel = vi.spyOn(queryClient, 'cancelQueries');
    await applyClosed(queryClient, draft(), null, () => undefined, allowed);
    expect(cancel).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
  });
});

describe('closedLandingHref: where the card page goes after a delete', () => {
  it('a draft returns to «Чернетки», a cancelled one to «Скасовані», both in their vertical', () => {
    expect(closedLandingHref(draft())).toBe(
      `/vacancies?status=DRAFT&vertical=${VERTICAL}`,
    );
    expect(closedLandingHref(draft('CANCELLED'))).toBe(
      `/vacancies?status=CANCELLED&vertical=${VERTICAL}`,
    );
  });
});

const rejectedRead = async () => {
  throw new Error('refetch failed');
};

describe('refreshDraft: a failed read never becomes an unhandled rejection', () => {
  it('swallows a rejected invalidation from the list and from the card', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(rejectedRead);
    refreshDraft(queryClient, ID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
