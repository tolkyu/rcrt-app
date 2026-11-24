// @vitest-environment jsdom
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useVacancyContentAccess,
  type VacancyContentAccessState,
} from '@/components/vacancies/use-vacancy-content-access';
import { ApiError } from '@/lib/api-client';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import { queryKeys } from '@/lib/query-keys';
import {
  vacancyContentReadSchema,
  type VacancyContentRead,
} from '@/lib/schemas/vacancy-content';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const KEY = queryKeys.vacancyContent(ID);
const content = (version: number): VacancyContentRead =>
  vacancyContentReadSchema.parse({
    id: ID,
    version,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: null,
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
  });

let client: QueryClient;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let seen: VacancyContentAccessState;

function Screen() {
  const { state } = useVacancyContentAccess(ID);
  useEffect(() => {
    seen = state;
  });
  return null;
}

/** The server render of the target route: its read is newer than the card's, so the boundary overwrites the live query. */
function serverState() {
  const server = new QueryClient();
  server.setQueryData(KEY, content(1), { updatedAt: Date.now() + 1_000 });
  return dehydrate(server);
}

const route = (page: 'card' | 'edit', state = serverState()) =>
  createElement(
    QueryClientProvider,
    { client },
    page === 'card'
      ? createElement(Screen, { key: 'card' })
      : createElement(
          HydrationBoundary,
          { key: 'edit', state },
          createElement(Screen),
        ),
  );

function pendingResponse() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 20));
  });

const failReads = () =>
  fetcher.mockImplementation(async () =>
    Response.json({ code: 'INTERNAL' }, { status: 500 }),
  );

const readFailed = () =>
  waitFor(() => {
    expect(client.getQueryState(KEY)?.status).toBe('error');
    expect(seen).toMatchObject({
      kind: 'checking',
      error: { code: 'INTERNAL' },
    });
  });

async function openCard() {
  client.setQueryData(KEY, content(1));
  fetcher.mockResolvedValueOnce(Response.json(content(1)));
  const view = render(route('card'));
  await waitFor(() => expect(seen.kind).toBe('readable'));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe('client navigation from the card to the editor [VAC-08, ADR-020]', () => {
  it('leaves checking after the entry read when the boundary rehydrates the live query', async () => {
    const view = await openCard();
    let answer: (response: Response) => void = () => {};
    fetcher.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    );
    view.rerender(route('edit'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(seen).toEqual({ kind: 'checking', error: null });

    await act(async () => answer(Response.json(content(2))));

    await waitFor(() =>
      expect(seen).toMatchObject({
        kind: 'readable',
        content: { version: 2 },
        canEdit: true,
      }),
    );
  });

  it('does not treat rehydrated server data as the fresh read', async () => {
    const view = await openCard();
    fetcher.mockReturnValueOnce(new Promise<Response>(() => {}));
    view.rerender(route('edit'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(seen).toEqual({ kind: 'checking', error: null });
    expect(seen).not.toHaveProperty('content');
  });

  it('keeps a failed entry read out of the readable state', async () => {
    const view = await openCard();
    failReads();
    view.rerender(route('edit'));
    await readFailed();
  });

  it('reads again when the card GET is cancelled by the navigation commit', async () => {
    const view = await openCard();
    const cardRead = pendingResponse();
    fetcher.mockReturnValueOnce(cardRead.promise);
    await act(async () => {
      void client.refetchQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const entry = pendingResponse();
    fetcher.mockReturnValueOnce(entry.promise);
    view.rerender(route('edit'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await act(async () => cardRead.resolve(Response.json(content(7))));
    await settle();
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => entry.resolve(Response.json(content(3))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 3 } }),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('joins a GET already in flight at mount and needs no second read', async () => {
    const inFlight = pendingResponse();
    fetcher.mockReturnValueOnce(inFlight.promise);
    const early = client.fetchQuery(vacancyContentQuery(ID));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    render(route('card'));
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => inFlight.resolve(Response.json(content(2))));
    await early;
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 2 } }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('starts a real GET when cached data is stamped ahead of the client clock', async () => {
    client.setQueryData(KEY, content(1), { updatedAt: Date.now() + 60_000 });
    const entry = pendingResponse();
    fetcher.mockReturnValueOnce(entry.promise);
    render(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => entry.resolve(Response.json(content(2))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 2 } }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe('only a real read of the current query proves access [ADR-020]', () => {
  it('keeps a no-data query checking when it is hydrated during the GET', async () => {
    const entry = pendingResponse();
    fetcher.mockReturnValueOnce(entry.promise);
    render(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(client.getQueryState(KEY)?.dataUpdateCount).toBe(0);
    act(() => hydrate(client, serverState()));
    await settle();
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => entry.resolve(Response.json(content(2))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 2 } }),
    );
  });

  it('keeps checking when setQueryData lands during the GET', async () => {
    const entry = pendingResponse();
    fetcher.mockReturnValueOnce(entry.promise);
    render(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(client.getQueryState(KEY)?.dataUpdateCount).toBe(0);
    act(() => {
      client.setQueryData(KEY, content(9));
    });
    await settle();
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => entry.resolve(Response.json(content(2))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 2 } }),
    );
  });

  it('a failed GET followed by hydration stays closed until a new GET succeeds', async () => {
    failReads();
    render(route('card'));
    await readFailed();
    const next = pendingResponse();
    fetcher.mockReset();
    fetcher.mockReturnValueOnce(next.promise);
    act(() => hydrate(client, serverState()));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(seen.kind).toBe('checking');
    await act(async () => next.resolve(Response.json(content(3))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 3 } }),
    );
  });

  it('a good GET, a failed re-read and hydration do not reopen editing', async () => {
    await openCard();
    failReads();
    await act(async () => {
      await client.refetchQueries({ queryKey: KEY });
    });
    await readFailed();
    const next = pendingResponse();
    fetcher.mockReset();
    fetcher.mockReturnValueOnce(next.promise);
    act(() => hydrate(client, serverState()));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(seen.kind).toBe('checking');
    await act(async () => next.resolve(Response.json(content(4))));
    await waitFor(() =>
      expect(seen).toMatchObject({
        kind: 'readable',
        content: { version: 4 },
        canEdit: true,
      }),
    );
  });

  it('ignores a late success from a removed query object', async () => {
    const late = pendingResponse();
    fetcher.mockReturnValueOnce(late.promise);
    const view = render(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const current = pendingResponse();
    fetcher.mockReturnValueOnce(current.promise);
    act(() => {
      client.removeQueries({ queryKey: KEY, exact: true });
      hydrate(client, serverState());
    });
    view.rerender(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => late.resolve(Response.json(content(8))));
    await settle();
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => current.resolve(Response.json(content(5))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 5 } }),
    );
  });

  it('a central purge followed by hydration before render stays closed until one new GET', async () => {
    await openCard();
    const next = pendingResponse();
    fetcher.mockReset();
    fetcher.mockReturnValueOnce(next.promise);
    act(() => {
      client
        .getQueryCache()
        .find({ queryKey: KEY })
        ?.setState({
          data: undefined,
          dataUpdatedAt: 0,
          error: new ApiError(404, 'NOT_FOUND'),
          errorUpdatedAt: Date.now(),
          status: 'error',
          fetchStatus: 'idle',
          isInvalidated: true,
        });
      hydrate(client, serverState());
    });
    await settle();
    expect(seen).toEqual({ kind: 'checking', error: null });
    expect(fetcher).toHaveBeenCalledOnce();
    await act(async () => next.resolve(Response.json(content(7))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 7 } }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('a failed retry attempt followed by a cancel does not restore the proof', async () => {
    client.setDefaultOptions({ queries: { retryDelay: 60_000 } });
    await openCard();
    fetcher.mockReset();
    fetcher.mockResolvedValueOnce(
      Response.json({ code: 'INTERNAL' }, { status: 500 }),
    );
    await act(async () => {
      void client.refetchQueries({ queryKey: KEY });
    });
    await waitFor(() =>
      expect(client.getQueryState(KEY)?.fetchFailureCount).toBe(1),
    );
    const next = pendingResponse();
    fetcher.mockReturnValueOnce(next.promise);
    await act(async () => {
      await client.cancelQueries({ queryKey: KEY });
    });
    await settle();
    expect(seen).toEqual({ kind: 'checking', error: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve(Response.json(content(8))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 8 } }),
    );
  });

  it('a session 401 being retried shows no error card', async () => {
    const retry = pendingResponse();
    fetcher
      .mockResolvedValueOnce(
        Response.json({ code: 'SESSION_EXPIRED' }, { status: 401 }),
      )
      .mockReturnValueOnce(retry.promise);
    render(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await settle();
    expect(client.getQueryState(KEY)?.fetchFailureCount).toBe(1);
    expect(seen).toEqual({ kind: 'checking', error: null });
    await act(async () => retry.resolve(Response.json(content(2))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 2 } }),
    );
  });

  it('removing a proven query revokes the proof before hydration refills it', async () => {
    const view = await openCard();
    const next = pendingResponse();
    fetcher.mockReturnValueOnce(next.promise);
    act(() => {
      client.removeQueries({ queryKey: KEY, exact: true });
      hydrate(client, serverState());
    });
    view.rerender(route('card'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(seen.kind).toBe('checking');
    await act(async () => next.resolve(Response.json(content(6))));
    await waitFor(() =>
      expect(seen).toMatchObject({ kind: 'readable', content: { version: 6 } }),
    );
  });
});
