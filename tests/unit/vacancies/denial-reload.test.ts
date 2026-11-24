// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VacanciesLayout from '@/app/(app)/vacancies/layout';
import { useLeaveGuard } from '@/components/ui/use-leave-guard';
import { assignableRecruitersQuery } from '@/lib/queries/vacancy-assignable';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { vacanciesQuery } from '@/lib/queries/vacancies';
import {
  vacancyDetailQuery,
  vacancyDraftCountQuery,
} from '@/lib/queries/vacancy-detail';
import { makeQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import {
  browserDenialPage,
  reloadRestoredPage,
  type DenialPage,
} from '@/lib/vacancy-denial';
import { toggleStatus } from '@/lib/vacancy-status-change';
import { SHARE_ID, shareVacancy } from '../../support/vacancy-share-harness';

const { nav, session, headerList } = vi.hoisted(() => ({
  nav: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    redirect: vi.fn((href: string) => {
      throw new Error(`redirect:${href}`);
    }),
    notFound: vi.fn(() => {
      throw new Error('not-found');
    }),
  },
  session: { requireSession: vi.fn() },
  headerList: { path: '/vacancies/abc' as string | null },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  redirect: nav.redirect,
  notFound: nav.notFound,
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => headerList.path }),
}));
vi.mock('@/app/(app)/_lib/session', () => session);

const KEY = queryKeys.vacancy(SHARE_ID);
const URL_A = 'https://app.test/vacancies/a';
const card = shareVacancy({
  status: 'OPEN',
  statusActions: ['HOLD', 'CANCEL'],
  version: 3,
});
const held: VacancyDetail = { ...card, status: 'ON_HOLD', version: 4 };
const content = {
  id: SHARE_ID,
  version: 3,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: true,
};
const problem = (status: number, code: string) =>
  Response.json({ code }, { status });

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function fakePage(
  storage: DenialPage['storage'] = memo(memoryStorage()),
  href = URL_A,
) {
  const replace = vi.fn<(href: string) => void>();
  const page: DenialPage = { href: () => href, storage, replace };
  return { page, replace };
}
function memo<T>(value: T) {
  return () => value;
}

function stubServer() {
  const server = {
    detail: (): Response => Response.json(card),
    content: (): Response => Response.json(content),
    list: (): Response =>
      Response.json({ items: [card], nextCursor: null, prevCursor: null }),
    picker: (): Response => Response.json({ items: [] }),
    count: (): Response => Response.json({ count: 0 }),
    me: (): Response => Response.json({}),
    write: (): Response => Response.json(held),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input).split('?')[0] ?? '';
      if (init?.method && init.method !== 'GET') return server.write();
      if (path.endsWith('/me')) return server.me();
      if (path.endsWith('/drafts/count')) return server.count();
      if (path.endsWith('/content')) return server.content();
      if (path.endsWith('/assignable-recruiters')) return server.picker();
      if (path.endsWith(`/vacancies/${SHARE_ID}`)) return server.detail();
      return server.list();
    }),
  );
  return server;
}

const clientFor = (page: DenialPage) => {
  const client = makeQueryClient(page);
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  return client;
};
const read = (client: QueryClient) =>
  client
    .fetchQuery({ ...vacancyDetailQuery(SHARE_ID), staleTime: 0 })
    .catch(() => undefined);
const readContent = (client: QueryClient) =>
  client.fetchQuery(vacancyContentQuery(SHARE_ID)).catch(() => undefined);
const readList = (client: QueryClient) =>
  client
    .fetchQuery({ ...vacanciesQuery({}), staleTime: 0 })
    .catch(() => undefined);
const change = {
  id: SHARE_ID,
  number: card.number,
  action: 'HOLD',
  version: 3,
  unassigned: false,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  headerList.path = '/vacancies/abc';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a confirmed loss of read reloads the page once', () => {
  it.each([
    ['detail 404', 'detail', 404, 'NOT_FOUND'],
    ['detail 403', 'detail', 403, 'FORBIDDEN'],
    ['detail MFA', 'detail', 401, 'MFA_REQUIRED'],
    ['content 404', 'content', 404, 'NOT_FOUND'],
    ['list 404', 'list', 404, 'NOT_FOUND'],
    ['list MFA', 'list', 401, 'MFA_REQUIRED'],
    ['session loss', 'detail', 401, 'SESSION_EXPIRED'],
  ] as const)('%s', async (_name, target, status, code) => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    client.setQueryData(KEY, card);
    server[target] = () => problem(status, code);
    await (target === 'detail'
      ? read(client)
      : target === 'content'
        ? readContent(client)
        : readList(client));
    expect(replace).toHaveBeenCalledExactlyOnceWith(URL_A);
    expect(client.getQueryData(KEY)).toBeUndefined();
  });

  it('simultaneous denials reload exactly once, after the purge', async () => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    client.setQueryData(KEY, card);
    replace.mockImplementation(() => {
      expect(client.getQueryData(KEY)).toBeUndefined();
    });
    server.detail = () => problem(404, 'NOT_FOUND');
    server.content = () => problem(404, 'NOT_FOUND');
    server.list = () => problem(404, 'NOT_FOUND');
    await Promise.all([read(client), readContent(client), readList(client)]);
    expect(replace).toHaveBeenCalledOnce();
  });
});

describe('the reload cannot loop', () => {
  it('a page still denied after its reload stays on the denied state', async () => {
    const server = stubServer();
    const storage = memo(memoryStorage());
    const first = fakePage(storage);
    server.detail = () => problem(404, 'NOT_FOUND');
    await read(clientFor(first.page));
    expect(first.replace).toHaveBeenCalledOnce();

    const second = fakePage(storage);
    const reloaded = clientFor(second.page);
    reloaded.setQueryData(KEY, card);
    await read(reloaded);
    expect(second.replace).not.toHaveBeenCalled();
    expect(reloaded.getQueryData(KEY)).toBeUndefined();
  });

  it('a successful read of the denied scope clears the marker', async () => {
    const server = stubServer();
    const storage = memo(memoryStorage());
    const first = fakePage(storage);
    server.detail = () => problem(404, 'NOT_FOUND');
    await read(clientFor(first.page));

    const second = fakePage(storage);
    const reloaded = clientFor(second.page);
    server.detail = () => Response.json(card);
    await read(reloaded);
    server.detail = () => problem(404, 'NOT_FOUND');
    await read(reloaded);
    expect(second.replace).toHaveBeenCalledOnce();
  });

  it('a successful read of another scope does not clear it', async () => {
    const server = stubServer();
    const storage = memo(memoryStorage());
    const first = fakePage(storage);
    server.content = () => problem(404, 'NOT_FOUND');
    await readContent(clientFor(first.page));

    const second = fakePage(storage);
    const reloaded = clientFor(second.page);
    await read(reloaded);
    await readContent(reloaded);
    expect(second.replace).not.toHaveBeenCalled();
  });

  it.each([
    [
      'reading',
      () => {
        throw new Error('blocked');
      },
    ],
    [
      'writing',
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ],
  ])(
    'storage failing on %s means no reload, data still purged',
    async (_name, storage) => {
      const server = stubServer();
      const { page, replace } = fakePage(storage);
      const client = clientFor(page);
      client.setQueryData(KEY, card);
      server.detail = () => problem(404, 'NOT_FOUND');
      await read(client);
      expect(replace).not.toHaveBeenCalled();
      expect(client.getQueryData(KEY)).toBeUndefined();
    },
  );

  it('without a browser page nothing throws and nothing reloads', async () => {
    const server = stubServer();
    vi.stubGlobal('window', undefined);
    const client = makeQueryClient();
    client.setQueryData(KEY, card);
    server.detail = () => problem(404, 'NOT_FOUND');
    await read(client);
    vi.unstubAllGlobals();
    expect(client.getQueryData(KEY)).toBeUndefined();
  });
});

describe('reload marks', () => {
  const MARKS = 'vacancy-denial-reload';
  const OTHER_ID = '00000000-0000-4000-8000-0000000000bb';
  const readOther = (client: QueryClient) =>
    client
      .fetchQuery({ ...vacancyDetailQuery(OTHER_ID), staleTime: 0 })
      .catch(() => undefined);
  const expireSession = async (storage: DenialPage['storage']) => {
    const opened = fakePage(storage);
    await read(clientFor(opened.page));
    return opened.replace;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A then B denied on one URL each reload once', async () => {
    const server = stubServer();
    const storage = memo(memoryStorage());
    const first = fakePage(storage);
    server.detail = () => problem(404, 'NOT_FOUND');
    await read(clientFor(first.page));
    expect(first.replace).toHaveBeenCalledOnce();

    const second = fakePage(storage);
    server.list = () => problem(404, 'NOT_FOUND');
    await readOther(clientFor(second.page));
    expect(second.replace).toHaveBeenCalledExactlyOnceWith(URL_A);

    const third = fakePage(storage);
    const client = clientFor(third.page);
    await read(client);
    await readOther(client);
    expect(third.replace).not.toHaveBeenCalled();
  });

  it('a second session expiry on one URL reloads after the throttle', async () => {
    const server = stubServer();
    const storage = memo(memoryStorage());
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    server.detail = () => problem(401, 'SESSION_EXPIRED');
    expect(await expireSession(storage)).toHaveBeenCalledOnce();

    clock.mockReturnValue(1_029_999);
    expect(await expireSession(storage)).not.toHaveBeenCalled();

    clock.mockReturnValue(1_030_000);
    expect(await expireSession(storage)).toHaveBeenCalledOnce();
  });

  it.each(['garbage', '99999999999999'])(
    'an unusable session stamp %s does not block the reload',
    async (stamp) => {
      const server = stubServer();
      const storage = memoryStorage();
      storage.setItem('vacancy-denial-at', stamp);
      vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      server.detail = () => problem(401, 'SESSION_EXPIRED');
      expect(await expireSession(memo(storage))).toHaveBeenCalledOnce();
    },
  );

  it('repeated denial of one key does not loop', async () => {
    const server = stubServer();
    const storage = memo(memoryStorage());
    server.detail = () => problem(404, 'NOT_FOUND');
    const replaces = [];
    for (let load = 0; load < 4; load += 1) {
      const opened = fakePage(storage);
      await read(clientFor(opened.page));
      replaces.push(opened.replace.mock.calls.length);
    }
    expect(replaces).toEqual([1, 0, 0, 0]);
  });

  it('a #main URL reloads without the fragment and shares its mark', async () => {
    const server = stubServer();
    const storage = memoryStorage();
    const replace = vi.fn<(href: string) => void>();
    const location = { href: `${URL_A}#main`, replace };
    vi.stubGlobal('window', { location, sessionStorage: storage });
    server.detail = () => problem(404, 'NOT_FOUND');
    await read(clientFor(browserDenialPage() as DenialPage));
    expect(replace).toHaveBeenCalledExactlyOnceWith(URL_A);

    location.href = URL_A;
    await read(clientFor(browserDenialPage() as DenialPage));
    expect(replace).toHaveBeenCalledOnce();
  });

  it.each(['{broken', 'null', '42', '{"https://app.test/a":"key"}'])(
    'unusable marker %s counts as empty',
    async (stored) => {
      const server = stubServer();
      const storage = memoryStorage();
      storage.setItem(MARKS, stored);
      const { page, replace } = fakePage(memo(storage));
      const client = clientFor(page);
      await expect(read(client)).resolves.toEqual(card);
      server.detail = () => problem(404, 'NOT_FOUND');
      await read(client);
      expect(replace).toHaveBeenCalledOnce();
      expect(storage.getItem(MARKS)).not.toContain('https');
    },
  );

  it('the stored marker keeps no raw search text', async () => {
    const server = stubServer();
    const storage = memoryStorage();
    const search = 'таємний-пошук';
    const href = `${URL_A}?q=${encodeURIComponent(search)}`;
    const { page, replace } = fakePage(memo(storage), href);
    const list = vacanciesQuery({ q: search } as Parameters<
      typeof vacanciesQuery
    >[0]);
    expect(JSON.stringify(list.queryKey)).toContain(search);
    server.list = () => problem(404, 'NOT_FOUND');
    await clientFor(page)
      .fetchQuery({ ...list, staleTime: 0 })
      .catch(() => undefined);
    expect(replace).toHaveBeenCalledOnce();
    const stored = storage.getItem(MARKS) ?? '';
    expect(stored).toMatch(/^,?[0-9a-z]{1,7}$/);
    expect(stored).not.toContain(search);
    expect(stored).not.toContain(encodeURIComponent(search));
  });
});

describe('the unsaved-changes guard does not block the reload', () => {
  it('releases beforeunload before the reload runs', async () => {
    window.history.replaceState(null, '', '/vacancies/new');
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    renderHook(() => useLeaveGuard(true));
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);

    let blocked: boolean | null = null;
    replace.mockImplementation(() => {
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      blocked = unload.defaultPrevented;
    });
    server.detail = () => problem(404, 'NOT_FOUND');
    await act(async () => {
      await read(client);
    });
    expect(blocked).toBe(false);
  });

  it('a guard that was never released by a denial keeps asking', async () => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    renderHook(() => useLeaveGuard(true));
    await act(async () => {
      await read(client);
    });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    expect(server).toBeDefined();
  });
});

describe('what must not reload', () => {
  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])('a write %i (%s) of a viewer who can still read', async (status, code) => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    client.setQueryData(KEY, card);
    server.write = () => problem(status, code);
    await toggleStatus(client, change);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(replace).not.toHaveBeenCalled();
    expect(client.getQueryData(KEY)).toMatchObject({ status: 'OPEN' });
  });

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])('a picker %i (%s)', async (status, code) => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    client.setQueryData(KEY, card);
    server.picker = () => problem(status, code);
    await client
      .fetchQuery(assignableRecruitersQuery(SHARE_ID))
      .catch(() => undefined);
    expect(replace).not.toHaveBeenCalled();
    expect(client.getQueryData(KEY)).toEqual(card);
  });

  it.each([
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])('a draft count %i (%s)', async (status, code) => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    server.count = () => problem(status, code);
    await client.fetchQuery(vacancyDraftCountQuery()).catch(() => undefined);
    expect(replace).not.toHaveBeenCalled();
  });

  it('a server error or a viewer who keeps access', async () => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    await read(client);
    server.detail = () => problem(500, 'INTERNAL');
    await read(client);
    expect(replace).not.toHaveBeenCalled();
  });

  it('a token-refresh race that a retry resolves', async () => {
    const server = stubServer();
    const { page, replace } = fakePage();
    const client = clientFor(page);
    client.setQueryData(KEY, card);
    let answers = 0;
    server.detail = () => {
      answers += 1;
      return answers === 1
        ? problem(401, 'UNAUTHENTICATED')
        : Response.json(card);
    };
    await read(client);
    expect(replace).not.toHaveBeenCalled();
    expect(client.getQueryData(KEY)).toEqual(card);
  });
});

describe('a page restored from the back-forward cache', () => {
  const show = (persisted: boolean) =>
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));

  it('reloads only when it was restored', () => {
    const reload = vi.fn();
    const stop = reloadRestoredPage(reload);
    show(false);
    expect(reload).not.toHaveBeenCalled();
    show(true);
    expect(reload).toHaveBeenCalledOnce();
    stop();
    show(true);
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('step-up for a withheld vacancy read [D63]', () => {
  const ctx = (granted: boolean, withheld: boolean) => ({
    auth: {
      grants: new Map(granted ? [['vacancy.read', [{}]]] : []),
      mfaWithheld: new Set(withheld ? ['vacancy.read'] : []),
    },
  });

  it('a withheld read goes to the existing 2FA page and returns here', async () => {
    session.requireSession.mockResolvedValue(ctx(false, true));
    await expect(VacanciesLayout({ children: null })).rejects.toThrow(
      `redirect:/mfa/verify?next=${encodeURIComponent('/vacancies/abc')}`,
    );
    expect(nav.notFound).not.toHaveBeenCalled();
  });

  it('a role without the read stays a real 404', async () => {
    session.requireSession.mockResolvedValue(ctx(false, false));
    await expect(VacanciesLayout({ children: null })).rejects.toThrow(
      'not-found',
    );
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it('a held read renders the page', async () => {
    session.requireSession.mockResolvedValue(ctx(true, false));
    await expect(VacanciesLayout({ children: 'page' })).resolves.toBe('page');
  });
});
