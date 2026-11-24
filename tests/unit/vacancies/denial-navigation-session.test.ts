// @vitest-environment jsdom
import {
  QueryClientProvider,
  QueryObserver,
  keepPreviousData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacanciesView } from '@/components/vacancies/vacancies-view';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import { ApiError } from '@/lib/api-client';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import {
  vacancyDetailQuery,
  vacancyDraftCountQuery,
} from '@/lib/queries/vacancy-detail';
import { makeQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancyPage } from '@/lib/schemas/vacancy';
import { toggleStatus } from '@/lib/vacancy-status-change';
import messages from '@/messages/uk.json';
import { SHARE_ID, shareVacancy } from '../../support/vacancy-share-harness';

const { router, toast } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/lib/toast', () => ({ toast }));
vi.mock('@/lib/use-wide-screen', () => ({ useWideScreen: () => false }));

const KEY = queryKeys.vacancy(SHARE_ID);
const copy = messages.vacancies;
const card = shareVacancy({
  status: 'OPEN',
  statusActions: ['HOLD', 'CANCEL'],
  version: 3,
});
const held: VacancyDetail = {
  ...card,
  status: 'ON_HOLD',
  statusActions: ['RESUME', 'CANCEL'],
  version: 4,
};
const content = {
  id: SHARE_ID,
  version: 3,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: true,
};
const change = {
  id: SHARE_ID,
  number: card.number,
  action: 'HOLD',
  version: 3,
  unassigned: false,
} as const;
const problem = (status: number, code: string) =>
  Response.json({ code }, { status });
const page = (...items: VacancyDetail[]): VacancyPage => ({
  items,
  nextCursor: null,
  prevCursor: null,
});

function stubServer() {
  const server = {
    detail: (): Response => Response.json(card),
    content: (): Response => Response.json(content),
    list: (): Response => Response.json(page(card)),
    count: (): Response => Response.json({ count: 0 }),
    me: (): Response => Response.json({}),
    write: (): Response | Promise<Response> => Response.json(held),
    reads: { detail: 0, content: 0, list: 0, me: 0 },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input).split('?')[0] ?? '';
      if (init?.method && init.method !== 'GET') return server.write();
      if (path.endsWith('/me')) {
        server.reads.me += 1;
        return server.me();
      }
      if (path.endsWith('/verticals')) return Response.json({ items: [] });
      if (path.endsWith('/drafts/count')) return server.count();
      if (path.endsWith('/content')) {
        server.reads.content += 1;
        return server.content();
      }
      if (path.endsWith(`/vacancies/${SHARE_ID}`)) {
        server.reads.detail += 1;
        return server.detail();
      }
      server.reads.list += 1;
      return server.list();
    }),
  );
  return server;
}

let client: QueryClient;
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
const providers = (view: ReactNode) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages,
    children: createElement(QueryClientProvider, {
      client,
      children: view,
    }),
  });
const readDetail = () =>
  act(async () => {
    await client
      .fetchQuery({ ...vacancyDetailQuery(SHARE_ID), staleTime: 0 })
      .catch(() => undefined);
  });
const listView = () =>
  createElement(VacanciesView, {
    canManagePositions: false,
    canAuthorDrafts: false,
    selfAssignVerticals: [],
    statusGrants: null,
    canRequestVacancy: false,
  });

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/vacancies');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  client = makeQueryClient(null);
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe('N2: a denied list read leaves no rows', () => {
  it.each([
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])(
    'list %i (%s) shows the error state with no rows and no loop',
    async (status, code) => {
      const server = stubServer();
      render(providers(listView()));
      expect((await screen.findAllByText(card.number)).length).toBeGreaterThan(
        0,
      );
      client.setQueryData(KEY, card);

      server.list = () => problem(status, code);
      await act(async () => {
        await client.refetchQueries({
          predicate: ({ queryKey }) =>
            queryKey[0] === 'vacancies' && typeof queryKey[1] === 'object',
        });
      });

      expect(await screen.findByRole('alert')).not.toBeNull();
      expect(screen.queryByText(card.number)).toBeNull();
      expect(client.getQueryData(KEY)).toBeUndefined();
      const reads = server.reads.list;
      await settle();
      expect(server.reads.list).toBe(reads);
    },
  );

  it('a late write after a list denial stays out of the cache', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    let answer: (value: Response) => void = () => undefined;
    server.write = () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      });
    const running = toggleStatus(client, change);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0),
    );
    server.list = () => problem(404, 'NOT_FOUND');
    await client.fetchQuery(vacanciesQuery({})).catch(() => undefined);
    answer(Response.json(held));
    await running;
    expect(client.getQueryData(KEY)).toBeUndefined();
  });

  it('a filter change after the denial cannot show the old rows as a placeholder', async () => {
    const server = stubServer();
    const first = vacanciesQuery({ status: 'OPEN' });
    const second = vacanciesQuery({ status: 'FILLED' });
    const third = vacanciesQuery({ status: 'ON_HOLD' });
    const observer = new QueryObserver(client, {
      ...first,
      placeholderData: keepPreviousData,
    });
    const stop = observer.subscribe(() => undefined);
    await waitFor(() =>
      expect(observer.getCurrentResult().data?.items).toHaveLength(1),
    );

    server.list = () => problem(404, 'NOT_FOUND');
    observer.setOptions({ ...second, placeholderData: keepPreviousData });
    await waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    server.list = () => new Promise<Response>(() => undefined) as never;
    observer.setOptions({ ...third, placeholderData: keepPreviousData });

    expect(observer.getCurrentResult().data).toBeUndefined();
    stop();
  });

  it.each([
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])('a draft count %i purges nothing', async (status, code) => {
    const server = stubServer();
    render(providers(createElement('div')));
    const list = queryKeys.vacancies({ status: 'OPEN' });
    client.setQueryData(list, page(card));
    client.setQueryData(KEY, card);
    server.count = () => problem(status, code);
    await act(async () => {
      await client.fetchQuery(vacancyDraftCountQuery()).catch(() => undefined);
    });
    expect(client.getQueryData(list)).toEqual(page(card));
    expect(client.getQueryData(KEY)).toEqual(card);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('MFA_REQUIRED on the card is not a lost session', () => {
  it('shows the not-found state, no skeleton, and keeps other data', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(['private'], 'value');
    server.content = () => problem(401, 'MFA_REQUIRED');
    render(
      providers(
        createElement(VacancyDetailView, {
          id: SHARE_ID,
          canAuthorDrafts: false,
        }),
      ),
    );
    expect(await screen.findByText(copy.detail.notFoundTitle)).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(card.number)).toBeNull();
    expect(client.getQueryData(['private'])).toBe('value');
  });

  it('a content write 401 MFA keeps a viewer who can still read', async () => {
    const server = stubServer();
    const view = renderHook(() => useVacancyContentAccess(SHARE_ID), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    });
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const token = await act(() => view.result.current.beginWrite());
    if (!token) throw new Error('Expected a write generation');
    server.content = () => Response.json(content);
    await act(async () => {
      await view.result.current.handleWriteError(
        new ApiError(401, 'MFA_REQUIRED'),
        token,
      );
    });
    expect(view.result.current.state.kind).toBe('readable');
  });
});

describe('a token refresh race is not a lost session', () => {
  it('a read 401 followed by a good retry keeps the cache', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(['private'], 'value');
    render(providers(createElement('div')));
    await settle();
    let answers = 0;
    server.detail = () => {
      answers += 1;
      return answers === 1
        ? problem(401, 'UNAUTHENTICATED')
        : Response.json(card);
    };
    await readDetail();
    expect(client.getQueryData(KEY)).toEqual(card);
    expect(client.getQueryData(['private'])).toBe('value');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('a read 401 that repeats is a lost session', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(['private'], 'value');
    render(providers(createElement('div')));
    await settle();
    server.detail = () => problem(401, 'SESSION_EXPIRED');
    await readDetail();
    expect(server.reads.detail).toBe(2);
    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(client.getQueryData(['private'])).toBeUndefined();
  });

  it('a write 401 with a live session keeps the cache', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(['private'], 'value');
    server.write = () => problem(401, 'UNAUTHENTICATED');
    await toggleStatus(client, change);
    await settle();
    expect(server.reads.me).toBeGreaterThan(0);
    expect(client.getQueryData(KEY)).toMatchObject({ status: 'OPEN' });
    expect(client.getQueryData(['private'])).toBe('value');
  });

  it('a write 401 confirmed by the session read purges', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(['private'], 'value');
    server.write = () => problem(401, 'SESSION_EXPIRED');
    server.me = () => problem(401, 'SESSION_EXPIRED');
    server.detail = () => problem(401, 'SESSION_EXPIRED');
    await toggleStatus(client, change);
    await settle();
    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(client.getQueryData(['private'])).toBeUndefined();
  });

  it('a content write 401 with a live session stays readable', async () => {
    stubServer();
    const view = renderHook(() => useVacancyContentAccess(SHARE_ID), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    });
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const token = await act(() => view.result.current.beginWrite());
    if (!token) throw new Error('Expected a write generation');
    await act(async () => {
      await view.result.current.handleWriteError(
        new ApiError(401, 'UNAUTHENTICATED'),
        token,
      );
    });
    expect(view.result.current.state.kind).toBe('readable');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
