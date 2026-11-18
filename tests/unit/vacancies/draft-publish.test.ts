import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import {
  publishFromList,
  type PublishHooks,
} from '@/lib/vacancy-draft-publish';
import { submitEdit } from '@/lib/vacancy-edit-submit';

const VERTICAL = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

// Wraps the real call so one test can make it throw: nothing inside it escapes as an exception.
vi.mock('@/lib/vacancy-edit-submit', async (importOriginal) => {
  const actual: Record<string, unknown> & {
    submitEdit: typeof submitEdit;
  } = await importOriginal();
  return { ...actual, submitEdit: vi.fn(actual.submitEdit) };
});

afterEach(() => vi.unstubAllGlobals());

const draft = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
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
const summary = (id: string, number: string): VacancyPage['items'][number] => ({
  id,
  number,
  title: 'Медіабаєр — Facebook',
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
const published = (changes: Partial<VacancyDetail> = {}) =>
  draft({
    status: 'OPEN',
    openedAt: '2026-11-17T09:00:00.000Z',
    version: 4,
    ...changes,
  });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string, errors: unknown[] = []) =>
  json(status, { code, errors });

// The keys the list really uses: filters pass through `vacancyApiFilters`.
const DRAFT_LIST = vacanciesQuery({
  status: 'DRAFT',
  vertical: VERTICAL,
}).queryKey;
const OPEN_LIST = vacanciesQuery({
  status: 'OPEN',
  vertical: VERTICAL,
}).queryKey;
const page = (...ids: [string, string][]): VacancyPage => ({
  items: ids.map(([id, number]) => summary(id, number)),
  nextCursor: null,
  prevCursor: null,
});

function setup(
  answers: (Response | Error)[],
  seeded: VacancyDetail | null = draft(),
) {
  const fetchSpy = vi.fn<typeof fetch>();
  for (const answer of answers)
    if (answer instanceof Error) fetchSpy.mockRejectedValueOnce(answer);
    else fetchSpy.mockResolvedValueOnce(answer);
  vi.stubGlobal('fetch', fetchSpy);
  const queryClient = new QueryClient();
  queryClient.setQueryData(DRAFT_LIST, page([ID, 'V-0015'], [OTHER, 'V-0014']));
  queryClient.setQueryData(OPEN_LIST, page([OTHER, 'V-0014']));
  queryClient.setQueryData(queryKeys.vacancyDraftCount(), { count: 4 });
  if (seeded) queryClient.setQueryData(queryKeys.vacancy(ID), seeded);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const hooks = {
    removed: vi.fn(),
    restored: vi.fn(),
    settled: vi.fn(),
  } satisfies PublishHooks;
  const sent = () =>
    fetchSpy.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
      key: (init?.headers as Record<string, string> | undefined)?.[
        'Idempotency-Key'
      ],
    }));
  return { queryClient, invalidate, hooks, sent, fetchSpy };
}

const idsOf = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryData<VacancyPage>(key)?.items.map((item) => item.id);
const snapshot = (client: QueryClient) =>
  JSON.stringify(
    client
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  );
const refreshedCard = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.some(
    ([filters]) =>
      JSON.stringify((filters as { queryKey?: unknown })?.queryKey) ===
      JSON.stringify(queryKeys.vacancy(ID)),
  );
const pending = () => {
  let answer: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    answer = resolve;
  });
  return { promise, answer: (response: Response) => answer(response) };
};

describe('publishFromList [ux §6.4]', () => {
  it('removes the row before the answer, sends one publish with the cached version and a key, then seeds the card', async () => {
    const { queryClient, hooks, sent, invalidate, fetchSpy } = setup([]);
    const slow = pending();
    fetchSpy.mockReturnValueOnce(slow.promise);
    const run = publishFromList(queryClient, ID, hooks);
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(hooks.removed).toHaveBeenCalledOnce();
    expect(idsOf(queryClient, DRAFT_LIST)).toEqual([OTHER]);
    expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
      count: 3,
    });
    slow.answer(json(200, published()));
    await expect(run).resolves.toEqual({
      status: 'published',
      draft: { id: ID, number: 'V-0015', title: 'Медіабаєр — Facebook' },
    });
    expect(sent()[0]).toMatchObject({
      url: `/api/v1/vacancies/${ID}/publish`,
      method: 'POST',
      body: { expectedVersion: 3 },
    });
    expect(sent()[0]!.key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(
      queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID))?.version,
    ).toBe(4);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
    expect(hooks.restored).not.toHaveBeenCalled();
  });

  it('reads the draft first when it is not cached', async () => {
    const { queryClient, hooks, sent } = setup(
      [json(200, draft()), json(200, published())],
      null,
    );
    const outcome = await publishFromList(queryClient, ID, hooks);
    expect(outcome.status).toBe('published');
    expect(sent().map(({ method, url }) => `${method} ${url}`)).toEqual([
      `GET /api/v1/vacancies/${ID}`,
      `POST /api/v1/vacancies/${ID}/publish`,
    ]);
  });

  it('a second press while one is in flight sends nothing', async () => {
    const { queryClient, hooks, sent, fetchSpy } = setup([]);
    const slow = pending();
    fetchSpy.mockReturnValueOnce(slow.promise);
    const first = publishFromList(queryClient, ID, hooks);
    await expect(publishFromList(queryClient, ID, hooks)).resolves.toEqual({
      status: 'busy',
    });
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    slow.answer(json(200, published()));
    await first;
    expect(sent()).toHaveLength(1);
  });

  it('refuses a draft without a position before any request or cache change', async () => {
    const { queryClient, hooks, sent } = setup([], draft({ position: null }));
    const outcome = await publishFromList(queryClient, ID, hooks);
    expect(outcome).toEqual({
      status: 'failed',
      effect: { type: 'fields', errors: { positionId: 'positionRequired' } },
    });
    expect(sent()).toEqual([]);
    expect(hooks.removed).not.toHaveBeenCalled();
    expect(idsOf(queryClient, DRAFT_LIST)).toEqual([ID, OTHER]);
  });

  it('a cached card that is no draft any more makes no request and refreshes', async () => {
    const { queryClient, hooks, sent, invalidate } = setup(
      [],
      draft({ status: 'OPEN' }),
    );
    const outcome = await publishFromList(queryClient, ID, hooks);
    expect(outcome).toEqual({ status: 'failed', effect: { type: 'notDraft' } });
    expect(sent()).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
  });

  const refused: [string, Response, string][] = [
    [
      'another tab saved first (409 STALE_STATE)',
      problem(409, 'STALE_STATE'),
      'stale',
    ],
    [
      'published elsewhere (409 VACANCY_NOT_DRAFT)',
      problem(409, 'VACANCY_NOT_DRAFT'),
      'notDraft',
    ],
    ['deleted meanwhile (404)', problem(404, 'NOT_FOUND'), 'gone'],
    [
      'position deactivated (409 POSITION_INACTIVE)',
      problem(409, 'POSITION_INACTIVE'),
      'fields',
    ],
    [
      'position missing on the server (400)',
      problem(400, 'VALIDATION_FAILED', [
        { path: 'body.positionId', code: 'required' },
      ]),
      'fields',
    ],
    ['rate limit (429)', problem(429, 'RATE_LIMITED'), 'toast'],
    ['forbidden (403)', problem(403, 'FORBIDDEN'), 'toast'],
    ['server error (500)', problem(500, 'INTERNAL'), 'toast'],
  ];
  it.each(refused)(
    '%s: rolls the lists, count and card back',
    async (_name, response, type) => {
      const { queryClient, hooks, invalidate } = setup([response]);
      const outcome = await publishFromList(queryClient, ID, hooks);
      expect(outcome).toMatchObject({ status: 'failed', effect: { type } });
      expect(idsOf(queryClient, DRAFT_LIST)).toEqual([ID, OTHER]);
      expect(queryClient.getQueryData(queryKeys.vacancyDraftCount())).toEqual({
        count: 4,
      });
      expect(
        queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID))?.status,
      ).toBe('DRAFT');
      expect(hooks.removed).toHaveBeenCalledOnce();
      expect(hooks.restored).toHaveBeenCalledOnce();
      expect(refreshedCard(invalidate)).toBe(
        ['stale', 'notDraft', 'gone'].includes(type),
      );
    },
  );

  it('a lost answer: the retry replays the same idempotency key, then succeeds', async () => {
    const { queryClient, hooks, sent } = setup([
      new TypeError('network'),
      json(200, published()),
    ]);
    const first = await publishFromList(queryClient, ID, hooks);
    expect(first).toMatchObject({
      status: 'failed',
      effect: { type: 'toast', title: 'noConnection', retry: true },
    });
    const second = await publishFromList(queryClient, ID, hooks);
    expect(second.status).toBe('published');
    const [lost, retried] = sent();
    expect(retried!.key).toBe(lost!.key);
    expect(retried!.body).toEqual(lost!.body);
  });

  it('a refused publish does not keep the key: the next try is a new request', async () => {
    const { queryClient, hooks, sent } = setup([
      problem(409, 'POSITION_INACTIVE'),
      json(200, published()),
    ]);
    await publishFromList(queryClient, ID, hooks);
    await publishFromList(queryClient, ID, hooks);
    const [first, second] = sent();
    expect(second!.key).not.toBe(first!.key);
  });

  it('a failed card read ends as a failure without touching the lists', async () => {
    const { queryClient, hooks } = setup(
      [
        problem(500, 'INTERNAL'),
        problem(500, 'INTERNAL'),
        problem(500, 'INTERNAL'),
      ],
      null,
    );
    const outcome = await publishFromList(queryClient, ID, hooks);
    expect(outcome.status).toBe('failed');
    expect(hooks.removed).not.toHaveBeenCalled();
    expect(idsOf(queryClient, DRAFT_LIST)).toEqual([ID, OTHER]);
  });

  it('an unexpected throw after the optimistic update restores the caches, tells the list and rethrows', async () => {
    const { queryClient, hooks } = setup([]);
    const before = snapshot(queryClient);
    vi.mocked(submitEdit).mockRejectedValueOnce(new Error('boom'));
    await expect(publishFromList(queryClient, ID, hooks)).rejects.toThrow(
      'boom',
    );
    expect(snapshot(queryClient)).toBe(before);
    expect(hooks.removed).toHaveBeenCalledOnce();
    expect(hooks.restored).toHaveBeenCalledOnce();
  });

  it('the lock is released after a throw: the same draft can be published again', async () => {
    const { queryClient, hooks } = setup([json(200, published())]);
    vi.mocked(submitEdit).mockRejectedValueOnce(new Error('boom'));
    await publishFromList(queryClient, ID, hooks).catch(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(json(200, published()));
    await expect(
      publishFromList(queryClient, ID, hooks),
    ).resolves.toMatchObject({ status: 'published' });
  });

  it('two drafts published at once, both refused: both rows and the count are back', async () => {
    const { queryClient, hooks, fetchSpy } = setup([]);
    queryClient.setQueryData(
      queryKeys.vacancy(OTHER),
      draft({ id: OTHER, number: 'V-0014' }),
    );
    fetchSpy.mockImplementation(async () => problem(409, 'POSITION_INACTIVE'));
    const before = snapshot(queryClient);
    const [first, second] = await Promise.all([
      publishFromList(queryClient, ID, hooks),
      publishFromList(queryClient, OTHER, hooks),
    ]);
    expect(first.status).toBe('failed');
    expect(second.status).toBe('failed');
    expect(snapshot(queryClient)).toBe(before);
  });

  it('a throwing removed hook cannot leave the optimistic write applied or the watch running', async () => {
    const { queryClient, hooks } = setup([]);
    const before = snapshot(queryClient);
    hooks.removed.mockImplementationOnce(() => {
      throw new Error('hook');
    });
    await expect(publishFromList(queryClient, ID, hooks)).rejects.toThrow(
      'hook',
    );
    expect(snapshot(queryClient)).toBe(before);
    expect(hooks.restored).toHaveBeenCalledOnce();
    // A refetch after the failure is taken as it is: the watch is gone.
    await queryClient.fetchQuery({
      queryKey: DRAFT_LIST,
      staleTime: 0,
      queryFn: () => page([ID, 'V-0015'], [OTHER, 'V-0014']),
    });
    expect(idsOf(queryClient, DRAFT_LIST)).toEqual([ID, OTHER]);
  });

  it('a published draft tells the list to forget it', async () => {
    const { queryClient, hooks } = setup([json(200, published())]);
    await publishFromList(queryClient, ID, hooks);
    expect(hooks.settled).toHaveBeenCalledOnce();
    expect(hooks.restored).not.toHaveBeenCalled();
  });
});
