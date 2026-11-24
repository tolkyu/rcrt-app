// @vitest-environment jsdom
import {
  QueryClientProvider,
  QueryObserver,
  type QueryClient,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import { VacancyPreview } from '@/components/vacancies/vacancy-preview';
import { assignableRecruitersQuery } from '@/lib/queries/vacancy-assignable';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { makeQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  CreateVacancyBody,
  VacancyDetail,
  VacancyPage,
} from '@/lib/schemas/vacancy';
import { watchVacancyAccess } from '@/lib/vacancy-detail-cache';
import { applyClosed, closeDraft } from '@/lib/vacancy-draft-close';
import { publishFromList } from '@/lib/vacancy-draft-publish';
import { createAttemptKeys, submitCreate } from '@/lib/vacancy-form-submit';
import { submitRequest } from '@/lib/vacancy-request-submit';
import { toggleStatus } from '@/lib/vacancy-status-change';
import messages from '@/messages/uk.json';
import {
  SHARE_ID,
  mountInUk,
  shareVacancy,
} from '../../support/vacancy-share-harness';

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
  usePathname: () => window.location.pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/lib/toast', () => ({ toast }));

const KEY = queryKeys.vacancy(SHARE_ID);
const CONTENT_KEY = queryKeys.vacancyContent(SHARE_ID);
const LIST_KEY = queryKeys.vacancies({ status: 'OPEN' });
const OTHER_ID = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const copy = messages.vacancies;

const card = shareVacancy({
  status: 'OPEN',
  statusActions: ['HOLD', 'CANCEL'],
  version: 3,
});
const draft = shareVacancy({
  status: 'DRAFT',
  openedAt: null,
  position: { id: '3f1e2d3c-4b5a-4968-8776-655443322110', name: 'Медіабаєр' },
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
const problem = (status: number, code: string) =>
  Response.json({ code }, { status });
const page = (...items: VacancyDetail[]): VacancyPage => ({
  items,
  nextCursor: null,
  prevCursor: null,
});

function deferred() {
  let resolve: (value: Response) => void = () => undefined;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

function stubServer() {
  const server = {
    detail: (): Response | Promise<Response> => Response.json(card),
    content: (): Response => Response.json(content),
    picker: (): Response => Response.json({ items: [] }),
    write: (): Response | Promise<Response> => Response.json(held),
    reads: { detail: 0, content: 0, picker: 0 },
    writes: 0,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method && init.method !== 'GET') {
        server.writes += 1;
        return server.write();
      }
      if (url.endsWith('/content')) {
        server.reads.content += 1;
        return server.content();
      }
      if (url.endsWith('/assignable-recruiters')) {
        server.reads.picker += 1;
        return server.picker();
      }
      if (url.endsWith(`/vacancies/${SHARE_ID}`)) {
        server.reads.detail += 1;
        return server.detail();
      }
      return Response.json(page());
    }),
  );
  return server;
}

let client: QueryClient;
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
const mount = (view: ReactNode) =>
  mountInUk(
    createElement(QueryClientProvider, {
      client,
      children: view,
    }),
  );
const refetchDetail = () =>
  act(async () => {
    await client.refetchQueries({ queryKey: KEY, exact: true });
  });
const readDetail = () =>
  act(async () => {
    await client
      .fetchQuery({ ...vacancyDetailQuery(SHARE_ID), staleTime: 0 })
      .catch(() => undefined);
  });
const change = {
  id: SHARE_ID,
  number: card.number,
  action: 'HOLD',
  version: 3,
  unassigned: false,
} as const;
const listIds = () =>
  client.getQueryData<VacancyPage>(LIST_KEY)?.items.map((row) => row.id);

beforeEach(() => {
  vi.clearAllMocks();
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

describe('B1: every read denial reaches the guard and the views stay denied', () => {
  it('preview: a 404 refetch shows not-found, no old data and no request loop', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    mount(
      createElement(VacancyPreview, { id: SHARE_ID, canAuthorDrafts: false }),
    );
    expect(await screen.findByText(card.number)).not.toBeNull();

    server.detail = () => problem(404, 'NOT_FOUND');
    await refetchDetail();

    expect(await screen.findByText(copy.previewNotFound)).not.toBeNull();
    expect(screen.queryByText(card.number)).toBeNull();
    expect(client.getQueryData(KEY)).toBeUndefined();
    const reads = server.reads.detail;
    await settle();
    expect(server.reads.detail).toBe(reads);
  });

  it('preview: a late status success after the denial leaves the cache empty', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    mount(
      createElement(VacancyPreview, { id: SHARE_ID, canAuthorDrafts: false }),
    );
    await screen.findByText(card.number);
    const answer = deferred();
    server.write = () => answer.promise;
    const running = toggleStatus(client, change);
    await waitFor(() => expect(server.writes).toBe(1));

    server.detail = () => problem(404, 'NOT_FOUND');
    await refetchDetail();
    answer.resolve(Response.json(held));
    await act(async () => {
      await running;
    });
    await settle();

    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(screen.queryByText(card.number)).toBeNull();
    expect(screen.getByText(copy.previewNotFound)).not.toBeNull();
  });

  it('card: a detail 404 replaces the card with not-found and stops reading', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    mount(
      createElement(VacancyDetailView, {
        id: SHARE_ID,
        canAuthorDrafts: false,
      }),
    );
    await waitFor(() => expect(server.reads.content).toBe(1));
    await screen.findByText(card.number);

    server.detail = () => problem(404, 'NOT_FOUND');
    server.content = () => problem(404, 'NOT_FOUND');
    await refetchDetail();

    expect(await screen.findByText(copy.detail.notFoundTitle)).not.toBeNull();
    expect(screen.queryByText(card.number)).toBeNull();
    expect(client.getQueryData(KEY)).toBeUndefined();
    const reads = { ...server.reads };
    await settle();
    expect(server.reads).toEqual(reads);
  });

  it('content access: a detail 404 ends in the denied state without a loop', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    const view = renderHook(() => useVacancyContentAccess(SHARE_ID), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    });
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );

    server.detail = () => problem(404, 'NOT_FOUND');
    await readDetail();

    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('unavailable'),
    );
    expect(client.getQueryData(CONTENT_KEY)).toBeUndefined();
    const reads = server.reads.content;
    await settle();
    expect(server.reads.content).toBe(reads);
  });

  it('a detail 403 purges the vacancy and leaves other vacancies', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(queryKeys.vacancy(OTHER_ID), { id: OTHER_ID });
    server.detail = () => problem(403, 'FORBIDDEN');
    await readDetail();
    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(client.getQueryData(queryKeys.vacancy(OTHER_ID))).toEqual({
      id: OTHER_ID,
    });
  });

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])(
    'a picker %i (%s) is action-only while the detail stays readable',
    async (status, code) => {
      const server = stubServer();
      client.setQueryData(KEY, card);
      const observer = new QueryObserver(client, vacancyDetailQuery(SHARE_ID));
      const stop = observer.subscribe(() => undefined);
      server.picker = () => problem(status, code);
      await client
        .fetchQuery(assignableRecruitersQuery(SHARE_ID))
        .catch(() => undefined);
      await settle();
      expect(client.getQueryData(KEY)).toEqual(card);
      stop();
    },
  );

  it('a picker 404 is proved by the card read when the vacancy is really gone', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    const observer = new QueryObserver(client, vacancyDetailQuery(SHARE_ID));
    const stop = observer.subscribe(() => undefined);
    server.picker = () => problem(404, 'NOT_FOUND');
    server.detail = () => problem(404, 'NOT_FOUND');
    await client
      .fetchQuery(assignableRecruitersQuery(SHARE_ID))
      .catch(() => undefined);
    await waitFor(() => expect(client.getQueryData(KEY)).toBeUndefined());
    stop();
  });

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [401, 'MFA_REQUIRED'],
  ])(
    'a write %i (%s) keeps the card of a viewer who can still read it',
    async (status, code) => {
      const server = stubServer();
      client.setQueryData(KEY, card);
      server.write = () => problem(status, code);
      await toggleStatus(client, change);
      await settle();
      expect(client.getQueryData(KEY)).toMatchObject({ status: 'OPEN' });
    },
  );

  it('a write 401 for a lost session empties the cache', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    client.setQueryData(['private'], 'value');
    server.write = () => problem(401, 'SESSION_EXPIRED');
    server.detail = () => problem(401, 'SESSION_EXPIRED');
    await toggleStatus(client, change);
    await settle();
    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(client.getQueryData(['private'])).toBeUndefined();
  });

  it('an adopted close retry stays out of the cache after a denial', async () => {
    const server = stubServer();
    client.setQueryData(KEY, draft);
    const stored = deferred();
    const cancelled: VacancyDetail = {
      ...draft,
      status: 'CANCELLED',
      version: 4,
    };
    server.write = () => problem(409, 'VACANCY_NOT_DRAFT');
    server.detail = () => stored.promise;
    const closable = {
      id: SHARE_ID,
      number: draft.number,
      title: draft.title,
      status: 'DRAFT',
      vertical: { id: draft.vertical.id },
    } as const;
    const stillAllowed = watchVacancyAccess(client, SHARE_ID);
    const running = closeDraft(client, 'cancel', closable, 'Дубль', true);
    await waitFor(() => expect(server.reads.detail).toBe(1));

    server.detail = () => problem(404, 'NOT_FOUND');
    await readDetail();
    stored.resolve(Response.json(cancelled));
    const outcome = await running;
    expect(outcome).toMatchObject({ status: 'done' });
    if (outcome.status !== 'done') throw new Error('Expected a closed draft');
    await applyClosed(
      client,
      closable,
      outcome.vacancy,
      () => undefined,
      stillAllowed,
    );

    expect(client.getQueryData(KEY)).toBeUndefined();
  });
});

describe('a new session after a denial', () => {
  it('a write in a new session updates the cache again', async () => {
    const server = stubServer();
    client.setQueryData(KEY, card);
    server.detail = () => problem(401, 'SESSION_EXPIRED');
    await readDetail();
    expect(client.getQueryData(KEY)).toBeUndefined();

    server.detail = () => Response.json(card);
    await readDetail();
    await toggleStatus(client, change);

    expect(client.getQueryData(KEY)).toEqual(held);
  });
});

describe('create flows respect a lost session', () => {
  const createBody = {
    mode: 'DRAFT',
    verticalId: OTHER_ID,
    title: 'Медіабаєр',
  } as CreateVacancyBody;
  const requestBody = {
    positionId: '3f1e2d3c-4b5a-4968-8776-655443322110',
    headcount: 1,
    priority: 'NORMAL',
    comment: 'Потрібен спеціаліст',
  } as const;
  const flows = {
    create: () => submitCreate(client, createAttemptKeys(), createBody),
    request: () => submitRequest(client, createAttemptKeys(), requestBody),
  };

  it.each(['create', 'request'] as const)(
    '%s answered after a 401 stays out of the cache',
    async (name) => {
      const server = stubServer();
      const answer = deferred();
      server.write = () => answer.promise;
      const running = flows[name]();
      await waitFor(() => expect(server.writes).toBe(1));

      server.detail = () => problem(401, 'SESSION_EXPIRED');
      await readDetail();
      answer.resolve(Response.json(card, { status: 201 }));
      await running;

      expect(client.getQueryData(KEY)).toBeUndefined();
    },
  );

  it.each(['create', 'request'] as const)(
    '%s after a 404 on another vacancy still seeds the cache',
    async (name) => {
      const server = stubServer();
      const answer = deferred();
      server.write = () => answer.promise;
      const running = flows[name]();
      await waitFor(() => expect(server.writes).toBe(1));
      client.setQueryData(queryKeys.vacancy(OTHER_ID), { id: OTHER_ID });
      answer.resolve(Response.json(card, { status: 201 }));
      await running;
      expect(client.getQueryData(KEY)).toEqual(card);
    },
  );
});

describe('list rows after a denial', () => {
  it('a detail 404 removes the row and leaves the others', async () => {
    const server = stubServer();
    const other = shareVacancy({ id: OTHER_ID });
    client.setQueryData(LIST_KEY, page(card, other));
    server.detail = () => problem(404, 'NOT_FOUND');
    await readDetail();
    expect(listIds()).toEqual([OTHER_ID]);
  });

  it('a 403 from the picker leaves the row', async () => {
    const server = stubServer();
    client.setQueryData(LIST_KEY, page(card));
    server.picker = () => problem(403, 'FORBIDDEN');
    await client
      .fetchQuery(assignableRecruitersQuery(SHARE_ID))
      .catch(() => undefined);
    expect(listIds()).toEqual([SHARE_ID]);
  });

  it('a failed publish does not put a denied row back', async () => {
    const server = stubServer();
    client.setQueryData(KEY, draft);
    client.setQueryData(LIST_KEY, page(draft));
    const answer = deferred();
    server.write = () => answer.promise;
    const running = publishFromList(client, SHARE_ID, {
      removed: () => undefined,
      restored: () => undefined,
      settled: () => undefined,
    });
    await waitFor(() => expect(server.writes).toBe(1));
    expect(listIds()).toEqual([]);

    server.detail = () => problem(404, 'NOT_FOUND');
    await readDetail();
    answer.resolve(problem(429, 'RATE_LIMITED'));
    await running;

    expect(listIds()).toEqual([]);
    expect(client.getQueryData(KEY)).toBeUndefined();
  });

  it('a failed publish still restores the row of a viewer who keeps access', async () => {
    const server = stubServer();
    client.setQueryData(KEY, draft);
    client.setQueryData(LIST_KEY, page(draft));
    server.write = () => problem(429, 'RATE_LIMITED');
    await publishFromList(client, SHARE_ID, {
      removed: () => undefined,
      restored: () => undefined,
      settled: () => undefined,
    });
    expect(listIds()).toEqual([SHARE_ID]);
  });
});
