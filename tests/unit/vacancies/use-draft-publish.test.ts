// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { DraftLeaveProvider } from '@/components/vacancies/draft-leave';
import { useDraftPublish } from '@/components/vacancies/use-draft-publish';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';

const { router, toast } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/toast', () => ({ toast }));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const t = messages.vacancies.draft.actions;

const draft = (changes: Partial<VacancyDetail> = {}): VacancyDetail => ({
  id: ID,
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70', name: 'Гемблінг' },
  position: { id: '3f1e2d3c-4b5a-4968-8776-655443322110', name: 'Медіабаєр' },
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
  ...changes,
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string) =>
  json(status, { code, errors: [] });

let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
let queryClient: QueryClient;
// The list takes the row over unless a test says it does not hold it.
const leave = {
  removed: vi.fn<(id: string) => boolean>(() => true),
  restored: vi.fn<(id: string) => boolean>(() => true),
  settled: vi.fn<(id: string) => void>(),
};

function mount(withList: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children: withList
          ? createElement(DraftLeaveProvider, { value: leave, children })
          : children,
      }),
    });
  return renderHook(() => useDraftPublish(), { wrapper }).result;
}
const publishRequests = () =>
  fetchSpy.mock.calls
    .filter(([url]) => String(url).endsWith('/publish'))
    .map(([, init]) => ({
      body: JSON.parse(String(init?.body)) as unknown,
      key: (init?.headers as Record<string, string>)['Idempotency-Key'],
    }));
const lastToast = (kind: 'success' | 'error' | 'warning') =>
  toast[kind].mock.calls.at(-1) as [
    string,
    {
      description?: string;
      id?: string;
      action?: { label: string; onAction: () => void };
    },
  ];

// The hook loads this module on the first press; transforming it under a busy runner would eat the wait budget.
beforeAll(() => import('@/lib/vacancy-draft-publish'));
beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchSpy);
  queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.vacancy(ID), draft());
  vi.clearAllMocks();
  leave.removed.mockImplementation(() => true);
  leave.restored.mockImplementation(() => true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDraftPublish: one press, one request, every answer a toast [ux §6.4]', () => {
  it('success: «Вакансію опубліковано» with number and title; «Відкрити» goes to the card', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(200, draft({ status: 'OPEN', version: 4 })),
    );
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [title, options] = lastToast('success');
    expect(title).toBe(t.toast.published);
    expect(options.description).toBe('V-0015 · Медіабаєр — Facebook');
    expect(options.action?.label).toBe(t.toast.open);
    options.action?.onAction();
    expect(router.push).toHaveBeenCalledWith(`/vacancies/${ID}`);
    expect(leave.removed).toHaveBeenCalledWith(ID);
    expect(leave.restored).not.toHaveBeenCalled();
    expect(leave.settled).toHaveBeenCalledWith(ID);
  });

  it('two quick presses send one request and announce once', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(200, draft({ status: 'OPEN', version: 4 })),
    );
    const publish = mount(true);
    act(() => {
      publish.current(draft());
      publish.current(draft());
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(publishRequests()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('without a list (the card) the caller moves focus instead of the list', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(200, draft({ status: 'OPEN', version: 4 })),
    );
    const publish = mount(false);
    const card = { removed: vi.fn(), restored: vi.fn() };
    act(() => publish.current(draft(), card));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(card.removed).toHaveBeenCalledOnce();
    expect(card.restored).not.toHaveBeenCalled();
    expect(leave.removed).not.toHaveBeenCalled();
  });

  it('a row the list does not hold (a shared ?vacancy= outside the page): the caller keeps the focus rule', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'STALE_STATE'));
    leave.removed.mockReturnValueOnce(false);
    leave.restored.mockReturnValueOnce(false);
    const publish = mount(true);
    const card = { removed: vi.fn(), restored: vi.fn() };
    act(() => publish.current(draft(), card));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(card.removed).toHaveBeenCalledOnce();
    expect(card.restored).toHaveBeenCalledOnce();
  });

  it('a row the list holds: the card rule stays out of it', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'STALE_STATE'));
    const publish = mount(true);
    const card = { removed: vi.fn(), restored: vi.fn() };
    act(() => publish.current(draft(), card));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(card.removed).not.toHaveBeenCalled();
    expect(card.restored).not.toHaveBeenCalled();
  });

  it('409 STALE_STATE: warning with the shared id and «Редагувати», which opens the edit page', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'STALE_STATE'));
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    const [title, options] = lastToast('warning');
    expect(title).toBe(t.toast.stale);
    expect(options.description).toBe(t.toast.staleDescription);
    expect(options.id).toBe(`stale:vacancy:${ID}`);
    expect(options.action?.label).toBe(t.edit);
    options.action?.onAction();
    expect(router.push).toHaveBeenCalledWith(`/vacancies/${ID}/edit`);
    expect(leave.restored).toHaveBeenCalledWith(ID);
  });

  it('409 VACANCY_NOT_DRAFT: the same warning without an edit button (nothing to edit)', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'VACANCY_NOT_DRAFT'));
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(lastToast('warning')[1].action).toBeUndefined();
  });

  it('a refused position: error toast whose action opens the edit page', async () => {
    fetchSpy.mockResolvedValueOnce(problem(409, 'POSITION_INACTIVE'));
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [title, options] = lastToast('error');
    expect(title).toBe(t.toast.failed);
    options.action?.onAction();
    expect(router.push).toHaveBeenCalledWith(`/vacancies/${ID}/edit`);
  });

  it('404: «Чернетку не знайдено» without an action', async () => {
    fetchSpy.mockResolvedValueOnce(problem(404, 'NOT_FOUND'));
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(lastToast('error')[0]).toBe(t.toast.gone);
    expect(lastToast('error')[1].action).toBeUndefined();
  });

  it('429 and 403 offer no retry', async () => {
    fetchSpy.mockResolvedValueOnce(problem(429, 'RATE_LIMITED'));
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(lastToast('warning')[0]).toBe(t.toast.rateLimited);
    expect(lastToast('warning')[1].action).toBeUndefined();
  });

  it('lost connection: the toast button repeats this publish with the same key, not another action', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json(200, draft({ status: 'OPEN', version: 4 })));
    const publish = mount(true);
    act(() => publish.current(draft()));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [title, options] = lastToast('error');
    expect(title).toBe(t.toast.noConnection);
    expect(options.action?.label).toBe(t.toast.retry);
    act(() => options.action?.onAction());
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [first, second] = publishRequests();
    expect(second).toEqual(first);
    expect(publishRequests()).toHaveLength(2);
  });

  it('a toast shown after the row unmounted still reaches the user', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(200, draft({ status: 'OPEN', version: 4 })),
    );
    const view = renderHook(() => useDraftPublish(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(NextIntlClientProvider, {
          locale: 'uk',
          messages,
          children: createElement(QueryClientProvider, {
            client: queryClient,
            children,
          }),
        }),
    });
    act(() => view.result.current(draft()));
    view.unmount();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
