// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useChangeUrgency } from '@/components/vacancies/use-change-urgency';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';

const { toast } = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('@/lib/toast', () => ({ toast }));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const t = messages.vacancies.urgency;

const detail = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0007',
  title: 'Медіабаєр — Facebook',
  vertical: { id: '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70', name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'OPEN',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: '2026-10-22T09:00:00.000Z',
  createdAt: '2026-10-18T09:00:00.000Z',
  updatedAt: '2026-10-22T09:00:00.000Z',
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
  canSelfAssign: false,
  canAssignRecruiters: false,
  canSetTeamLead: false,
  statusActions: [],
  needsMfa: false,
  ...changes,
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string) =>
  json(status, { code, errors: [] });

type Fetch = ReturnType<typeof vi.fn<typeof fetch>>;
let fetchSpy: Fetch;
let queryClient: QueryClient;

const puts = () =>
  fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT');
const putBodies = () =>
  puts().map(([, init]) => JSON.parse(String(init?.body)));
const reads = () =>
  fetchSpy.mock.calls.filter(([, init]) => init?.method !== 'PUT');
const cached = () =>
  queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID));

/** The card as the page reads it: the cache entry, so a rerender follows the optimistic flip. */
function mount() {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children,
      }),
    });
  return renderHook(
    () => {
      const { data } = useQuery({
        queryKey: queryKeys.vacancy(ID),
        queryFn: () => Promise.reject(new Error('not fetched')),
        enabled: false,
      });
      const card = data ?? detail();
      return { card, ...useChangeUrgency(card) };
    },
    { wrapper },
  );
}

type Options = {
  description?: string;
  id?: string;
  action?: { label: string; onAction: () => void };
};
const last = (kind: 'success' | 'error' | 'warning') =>
  toast[kind].mock.calls.at(-1) as [string, Options];

function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeAll(() => import('@/lib/vacancy-urgency-change'));
beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchSpy);
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(queryKeys.vacancy(ID), detail());
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useChangeUrgency [STORY-VAC-08-2, D94, D127]', () => {
  it('flips the card before the answer, sends the version, and keeps the answer', async () => {
    const answer = deferred();
    fetchSpy.mockReturnValueOnce(answer.promise);
    const { result } = mount();
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(cached()?.priority).toBe('URGENT'));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(result.current.pending).toBe(true);
    expect(cached()?.version).toBe(3);
    const [url, init] = puts()[0]!;
    expect(String(url)).toBe(`/api/v1/vacancies/${ID}/urgency`);
    expect((init?.headers as Record<string, string>)['X-CSRF-Protection']).toBe(
      '1',
    );
    expect(putBodies()).toEqual([{ priority: 'URGENT', expectedVersion: 3 }]);
    await act(async () => {
      answer.resolve(json(200, detail({ priority: 'URGENT', version: 4 })));
      await answer.promise;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(cached()).toMatchObject({ priority: 'URGENT', version: 4 });
    const [title, options] = last('success');
    expect(title).toBe(t.toast.changed);
    expect(options.description).toBe('V-0007 · Звичайна → Термінова');
    expect(options.id).toBe(`urgency:${ID}`);
  });

  it('says «Термінова → Звичайна» the other way round', async () => {
    queryClient.setQueryData(
      queryKeys.vacancy(ID),
      detail({ priority: 'URGENT' }),
    );
    fetchSpy.mockResolvedValueOnce(json(200, detail({ version: 4 })));
    const { result } = mount();
    act(() => result.current.change('NORMAL'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(last('success')[1].description).toBe(
      'V-0007 · Термінова → Звичайна',
    );
  });

  it('invalidates the lists and the card after a success', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fetchSpy.mockResolvedValueOnce(
      json(200, detail({ priority: 'URGENT', version: 4 })),
    );
    const { result } = mount();
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(queryKeys.vacanciesAll());
    expect(keys).toContainEqual(queryKeys.vacancy(ID));
  });

  it('sends nothing for the value that is already selected', () => {
    const { result } = mount();
    act(() => result.current.change('NORMAL'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a double press sends exactly one request', async () => {
    const answer = deferred();
    fetchSpy.mockReturnValueOnce(answer.promise);
    const { result } = mount();
    act(() => {
      result.current.change('URGENT');
      result.current.change('URGENT');
      result.current.change('NORMAL');
    });
    await waitFor(() => expect(puts()).toHaveLength(1));
    await act(async () => {
      answer.resolve(json(200, detail({ priority: 'URGENT', version: 4 })));
      await answer.promise;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(puts()).toHaveLength(1);
  });

  it('a second change after the first one settled is sent with the new version', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        json(200, detail({ priority: 'URGENT', version: 4 })),
      )
      .mockResolvedValue(json(200, detail({ version: 5 })));
    const { result } = mount();
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(result.current.pending).toBe(false));
    act(() => result.current.change('NORMAL'));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(putBodies()).toEqual([
      { priority: 'URGENT', expectedVersion: 3 },
      { priority: 'NORMAL', expectedVersion: 4 },
    ]);
  });

  it('a late success after unmount still updates the cache and the toast', async () => {
    const answer = deferred();
    fetchSpy.mockReturnValueOnce(answer.promise);
    const { result, unmount } = mount();
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(puts()).toHaveLength(1));
    unmount();
    await act(async () => {
      answer.resolve(json(200, detail({ priority: 'URGENT', version: 4 })));
      await answer.promise;
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(cached()).toMatchObject({ priority: 'URGENT', version: 4 });
  });

  it('a late failure after unmount rolls back and tells the user', async () => {
    const answer = deferred();
    fetchSpy.mockReturnValueOnce(answer.promise);
    const { result, unmount } = mount();
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(puts()).toHaveLength(1));
    unmount();
    await act(async () => {
      answer.resolve(problem(500, 'INTERNAL'));
      await answer.promise;
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(cached()?.priority).toBe('NORMAL');
  });

  describe('failures roll the card back and end in a toast', () => {
    it('409 STALE_STATE: no retry, the refetched value is named, the cache holds the server state', async () => {
      fetchSpy
        .mockResolvedValueOnce(problem(409, 'STALE_STATE'))
        .mockResolvedValue(
          json(200, detail({ priority: 'URGENT', version: 5 })),
        );
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());
      const [title, options] = last('warning');
      expect(title).toBe(t.toast.stale);
      expect(options.description).toBe(
        'Терміновість уже змінено: тепер «Термінова». Якщо потрібно, змініть ще раз.',
      );
      expect(options.id).toBe(`stale:vacancy:${ID}`);
      expect(options.action).toBeUndefined();
      expect(cached()).toMatchObject({ priority: 'URGENT', version: 5 });
      expect(reads().length).toBeGreaterThan(0);
      expect(putBodies()).toHaveLength(1);
    });

    it('409 STALE_STATE with an unreadable refetch: warns without a value and rolls back', async () => {
      fetchSpy
        .mockResolvedValueOnce(problem(409, 'STALE_STATE'))
        .mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());
      expect(last('warning')[1].description).toBe(t.toast.staleUnknown);
      expect(cached()?.priority).toBe('NORMAL');
    });

    it('409 VACANCY_URGENCY_LOCKED: error toast without retry, card and lists refreshed', async () => {
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      fetchSpy.mockResolvedValueOnce(problem(409, 'VACANCY_URGENCY_LOCKED'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [title, options] = last('error');
      expect(title).toBe(t.toast.failed);
      expect(options.description).toBe(t.toast.lockedDescription);
      expect(options.action).toBeUndefined();
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(keys).toContainEqual(queryKeys.vacancy(ID));
      expect(cached()?.priority).toBe('NORMAL');
    });

    it.each([
      [403, 'FORBIDDEN', t.toast.forbidden],
      [401, 'MFA_REQUIRED', t.toast.forbidden],
      [404, 'NOT_FOUND', t.toast.gone],
    ])('%i %s: toast, no retry', async (status, code, text) => {
      fetchSpy.mockResolvedValueOnce(problem(status, code));
      fetchSpy.mockResolvedValue(problem(status, code));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(last('error')[0]).toBe(text);
      expect(last('error')[1].action).toBeUndefined();
      expect(cached()?.priority).toBe('NORMAL');
    });

    it('403 and 404 refresh the card and the lists', async () => {
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      fetchSpy.mockResolvedValue(problem(403, 'FORBIDDEN'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(keys).toContainEqual(queryKeys.vacanciesAll());
      expect(keys).toContainEqual(queryKeys.vacancy(ID));
    });

    it('429: warning without retry and without a refetch', async () => {
      fetchSpy.mockResolvedValueOnce(problem(429, 'RATE_LIMITED'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());
      expect(last('warning')[0]).toBe(t.toast.rateLimited);
      expect(last('warning')[1].action).toBeUndefined();
      expect(cached()?.priority).toBe('NORMAL');
      expect(reads()).toHaveLength(0);
    });

    it('500: «Зміну не збережено», «Повернули як було.» and a «Повторити» that repeats this change', async () => {
      fetchSpy.mockResolvedValueOnce(problem(500, 'INTERNAL'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [title, options] = last('error');
      expect(title).toBe(t.toast.failed);
      expect(options.description).toBe(t.toast.failedDescription);
      expect(options.action?.label).toBe(t.toast.retry);
      expect(cached()?.priority).toBe('NORMAL');
      fetchSpy.mockResolvedValue(
        json(200, detail({ priority: 'URGENT', version: 4 })),
      );
      act(() => options.action?.onAction());
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(putBodies()).toEqual([
        { priority: 'URGENT', expectedVersion: 3 },
        { priority: 'URGENT', expectedVersion: 3 },
      ]);
    });

    it('lost connection: «Немає зʼєднання», rollback, and «Повторити» sends the same change', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [title, options] = last('error');
      expect(title).toBe(t.toast.noConnection);
      expect(options.description).toBe(t.toast.noConnectionDescription);
      expect(cached()?.priority).toBe('NORMAL');
      fetchSpy.mockResolvedValue(
        json(200, detail({ priority: 'URGENT', version: 4 })),
      );
      act(() => options.action?.onAction());
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(putBodies().at(-1)).toEqual({
        priority: 'URGENT',
        expectedVersion: 3,
      });
    });

    it('a retry that meets its own earlier write (the answer was lost) adopts it instead of warning', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      fetchSpy
        .mockResolvedValueOnce(problem(409, 'STALE_STATE'))
        .mockResolvedValue(
          json(200, detail({ priority: 'URGENT', version: 4 })),
        );
      act(() => last('error')[1].action?.onAction());
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(toast.warning).not.toHaveBeenCalled();
      expect(cached()).toMatchObject({ priority: 'URGENT', version: 4 });
    });

    it('a conflict whose server value is the wanted one but two writes ahead still warns', async () => {
      fetchSpy
        .mockResolvedValueOnce(problem(409, 'STALE_STATE'))
        .mockResolvedValue(
          json(200, detail({ priority: 'URGENT', version: 5 })),
        );
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.warning).toHaveBeenCalled());
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('an unexpected throw while announcing ends in a retry toast, never an unhandled rejection', async () => {
      fetchSpy.mockResolvedValueOnce(
        json(200, detail({ priority: 'URGENT', version: 4 })),
      );
      toast.success.mockImplementationOnce(() => {
        throw new Error('toast runtime');
      });
      const { result } = mount();
      act(() => result.current.change('URGENT'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(last('error')[1].action?.label).toBe(t.toast.retry);
    });
  });

  it('unlocks after a failure: the same press works again', async () => {
    fetchSpy
      .mockResolvedValueOnce(problem(500, 'INTERNAL'))
      .mockResolvedValue(json(200, detail({ priority: 'URGENT', version: 4 })));
    const { result } = mount();
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(result.current.pending).toBe(false));
    act(() => result.current.change('URGENT'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(puts()).toHaveLength(2);
  });
});
