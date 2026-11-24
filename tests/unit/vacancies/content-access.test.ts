// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { assignableRecruitersQuery } from '@/lib/queries/vacancy-assignable';
import { vacancyContentQuery } from '@/lib/queries/vacancy-content';
import {
  vacancyContentReadSchema,
  type VacancyContentRead,
} from '@/lib/schemas/vacancy-content';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const content = (overrides: Partial<VacancyContentRead> = {}) =>
  vacancyContentReadSchema.parse({
    id: ID,
    version: 1,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'private content' }],
        },
      ],
    },
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
    ...overrides,
  });
const problem = (status: number, code: string) =>
  Response.json({ code }, { status });
function deferred() {
  let resolve: (value: Response) => void = () => {};
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
let client: QueryClient;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(content()));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});
function mount(id = ID) {
  return renderHook(({ id: currentId }) => useVacancyContentAccess(currentId), {
    initialProps: { id },
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client, children }),
  });
}

describe('single content observer and entry validation [ADR-020]', () => {
  it('keeps hydrated documents hidden until a successful current read', async () => {
    client.setQueryData(queryKeys.vacancyContent(ID), content());
    const entry = deferred();
    fetcher.mockReturnValueOnce(entry.promise);
    const view = mount();
    expect(view.result.current.state).toEqual({
      kind: 'checking',
      error: null,
    });
    expect(
      client
        .getQueryCache()
        .find({ queryKey: queryKeys.vacancyContent(ID) })
        ?.getObserversCount(),
    ).toBe(1);
    await act(async () =>
      entry.resolve(Response.json(content({ version: 2 }))),
    );
    await waitFor(() =>
      expect(view.result.current.state).toMatchObject({
        kind: 'readable',
        content: { version: 2 },
        canEdit: true,
      }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not activate saving from cached eligibility before entry completes', async () => {
    client.setQueryData(queryKeys.vacancyContent(ID), content());
    const entry = deferred();
    fetcher.mockReturnValueOnce(entry.promise);
    const view = mount();
    expect(await view.result.current.beginWrite()).toBeNull();
    await act(async () =>
      entry.resolve(Response.json(content({ canEditContent: false }))),
    );
    await waitFor(() =>
      expect(view.result.current.state).toMatchObject({
        kind: 'readable',
        canEdit: false,
      }),
    );
    expect(await view.result.current.beginWrite()).toBeNull();
  });
  it('enforces status together with the successful-read eligibility flag', async () => {
    fetcher.mockResolvedValue(Response.json(content({ status: 'FILLED' })));
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state).toMatchObject({
        kind: 'readable',
        canEdit: false,
      }),
    );
  });
  it('returns no cached payload after a recoverable read failure', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    fetcher.mockImplementation(async () => problem(500, 'INTERNAL'));
    await act(async () => {
      await view.result.current.revalidate();
    });
    expect(view.result.current.state).toMatchObject({
      kind: 'checking',
      error: { code: 'INTERNAL' },
    });
    expect(view.result.current.state).not.toHaveProperty('content');
  });
});

describe('terminal denials remove protected state [ADR-020]', () => {
  it('404 immediately exposes no payload, removes cached documents and detaches the observer', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    fetcher.mockImplementation(async () => problem(404, 'NOT_FOUND'));
    await act(async () => {
      await view.result.current.revalidate();
    });
    expect(view.result.current.state).toEqual({
      kind: 'unavailable',
      reason: 'notFound',
      code: 'NOT_FOUND',
    });
    expect(client.getQueryData(queryKeys.vacancyContent(ID))).toBeUndefined();
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .find({ queryKey: queryKeys.vacancyContent(ID) })
          ?.getObserversCount() ?? 0,
      ).toBe(0),
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.vacancy(ID) });
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it('GET 403 is terminal like 404: no payload, cache removed, observer detached, no refetch', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    fetcher.mockImplementation(async () => problem(403, 'FORBIDDEN'));
    await act(async () => {
      await view.result.current.revalidate();
    });
    expect(view.result.current.state).toEqual({
      kind: 'unavailable',
      reason: 'notFound',
      code: 'FORBIDDEN',
    });
    expect(client.getQueryData(queryKeys.vacancyContent(ID))).toBeUndefined();
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .find({ queryKey: queryKeys.vacancyContent(ID) })
          ?.getObserversCount() ?? 0,
      ).toBe(0),
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.vacancy(ID) });
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it.each([404, 403])(
    'GET %i also removes this vacancy detail from the client cache and leaves other vacancies alone',
    async (status) => {
      const view = mount();
      await waitFor(() =>
        expect(view.result.current.state.kind).toBe('readable'),
      );
      client.setQueryData(queryKeys.vacancy(ID), { id: ID, title: 'private' });
      client.setQueryData(queryKeys.vacancy(OTHER), { id: OTHER });
      fetcher.mockImplementation(async () => problem(status, 'DENIED'));
      await act(async () => {
        await view.result.current.revalidate();
      });
      expect(view.result.current.state.kind).toBe('unavailable');
      expect(client.getQueryData(queryKeys.vacancy(ID))).toBeUndefined();
      expect(client.getQueryData(queryKeys.vacancy(OTHER))).toEqual({
        id: OTHER,
      });
    },
  );
  it.each([404, 403])(
    'GET %i removes every entry of this vacancy, drops its late answer and starts no new read',
    async (status) => {
      const view = mount();
      await waitFor(() =>
        expect(view.result.current.state.kind).toBe('readable'),
      );
      const picker = queryKeys.vacancyAssignableRecruiters(ID);
      const otherPicker = queryKeys.vacancyAssignableRecruiters(OTHER);
      const list = queryKeys.vacancies({ status: 'OPEN' });
      client.setQueryData(queryKeys.vacancy(OTHER), { id: OTHER });
      client.setQueryData(queryKeys.vacancyContent(OTHER), { id: OTHER });
      client.setQueryData(otherPicker, { items: [] });
      client.setQueryData(list, { items: [] });
      const late = deferred();
      fetcher.mockImplementation((url) =>
        String(url).endsWith('/assignable-recruiters')
          ? late.promise
          : Promise.resolve(problem(status, 'DENIED')),
      );
      const lateRead = client
        .fetchQuery(assignableRecruitersQuery(ID))
        .catch(() => null);
      await act(async () => {
        await view.result.current.revalidate();
      });
      expect(view.result.current.state.kind).toBe('unavailable');
      expect(client.getQueryCache().find({ queryKey: picker })).toBeUndefined();
      // A cancelled read may still reach fetch after its lazy schema loads, but already aborted.
      const liveReads = () =>
        fetcher.mock.calls.filter(([, init]) => !init?.signal?.aborted).length;
      const readsAfterDenial = liveReads();
      late.resolve(Response.json({ items: [] }));
      await lateRead;
      await act(async () => {
        await client.invalidateQueries({ queryKey: queryKeys.vacancy(ID) });
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      expect(client.getQueryCache().find({ queryKey: picker })).toBeUndefined();
      expect(client.getQueryData(queryKeys.vacancy(ID))).toBeUndefined();
      expect(client.getQueryData(queryKeys.vacancyContent(ID))).toBeUndefined();
      expect(liveReads()).toBe(readsAfterDenial);
      expect(client.getQueryData(queryKeys.vacancy(OTHER))).toEqual({
        id: OTHER,
      });
      expect(client.getQueryData(queryKeys.vacancyContent(OTHER))).toEqual({
        id: OTHER,
      });
      expect(client.getQueryData(otherPicker)).toEqual({ items: [] });
      expect(client.getQueryData(list)).toEqual({ items: [] });
      expect(router.refresh).not.toHaveBeenCalled();
    },
  );
  it('401 cancels and clears the old client before refreshing the server session guard', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    client.setQueryData(['other-private'], 'private');
    const late = deferred();
    const oldWork = client
      .fetchQuery({
        queryKey: ['late-private'],
        queryFn: () => late.promise.then(() => 'private'),
      })
      .catch(() => null);
    router.refresh.mockImplementationOnce(() =>
      expect(client.getQueryCache().getAll()).toEqual([]),
    );
    fetcher.mockImplementation(async () => problem(401, 'SESSION_EXPIRED'));
    await act(async () => {
      await view.result.current.revalidate();
    });
    expect(view.result.current.state).toEqual({
      kind: 'unavailable',
      reason: 'session',
      code: 'SESSION_EXPIRED',
    });
    expect(router.refresh).toHaveBeenCalledOnce();
    late.resolve(Response.json(content()));
    await oldWork;
    expect(client.getQueryData(['late-private'])).toBeUndefined();
    expect(client.getQueryData(['other-private'])).toBeUndefined();
  });
  it('PATCH 401 confirmed by the read is terminal even while the content query still contains a successful read', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const token = await act(() => view.result.current.beginWrite());
    if (!token) throw new Error('Expected a write generation');
    fetcher.mockImplementation(async () => problem(401, 'SESSION_EXPIRED'));
    await act(async () => {
      await view.result.current.handleWriteError(
        new ApiError(401, 'SESSION_EXPIRED'),
        token,
      );
    });
    expect(view.result.current.state).toEqual({
      kind: 'unavailable',
      reason: 'session',
      code: 'SESSION_EXPIRED',
    });
    expect(token.isCurrent()).toBe(false);
  });
});

describe('mutation generations and current access [ADR-020]', () => {
  it('a pre-dispatch GET ignoring abort cannot overwrite the fresh post-success revision', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const oldRead = deferred();
    fetcher
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValue(Response.json(content({ version: 2 })));
    let oldWork: Promise<unknown> = Promise.resolve();
    let begin: ReturnType<typeof view.result.current.beginWrite> =
      Promise.resolve(null);
    act(() => {
      oldWork = client.fetchQuery(vacancyContentQuery(ID)).catch(() => null);
      begin = view.result.current.beginWrite();
    });
    const token = await begin;
    if (!token) throw new Error('Expected a write generation');
    await act(async () => {
      expect(await view.result.current.finishWrite(token)).toMatchObject({
        version: 2,
      });
    });
    await waitFor(() =>
      expect(view.result.current.state).toMatchObject({
        kind: 'readable',
        content: { version: 2 },
      }),
    );
    oldRead.resolve(Response.json(content({ version: 1 })));
    await oldWork;
    expect(client.getQueryData(queryKeys.vacancyContent(ID))).toMatchObject({
      version: 2,
    });
    expect(view.result.current.state).toMatchObject({
      kind: 'readable',
      content: { version: 2 },
    });
  });
  it('pauses focus/invalidation during a write, prevents duplicate dispatch and refreshes once after success', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const token = await act(() => view.result.current.beginWrite());
    if (!token) throw new Error('Expected a write generation');
    expect(view.result.current.state).toMatchObject({
      kind: 'readable',
      refreshing: true,
      canEdit: false,
    });
    expect(await view.result.current.beginWrite()).toBeNull();
    expect(await view.result.current.revalidate()).toBeNull();
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.vacancy(ID) });
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const fresh = deferred();
    fetcher.mockReturnValueOnce(fresh.promise);
    let pending: ReturnType<typeof view.result.current.finishWrite> =
      Promise.resolve(null);
    act(() => {
      pending = view.result.current.finishWrite(token);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(view.result.current.state).toMatchObject({ canEdit: false });
    await act(async () => {
      fresh.resolve(Response.json(content({ version: 2 })));
      expect(await pending).toMatchObject({ version: 2 });
    });
    await waitFor(() =>
      expect(view.result.current.state).toMatchObject({
        kind: 'readable',
        canEdit: true,
        content: { version: 2 },
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])(
    'PATCH 403 refreshes a readable result with independent eligibility %s',
    async (canEditContent) => {
      const view = mount();
      await waitFor(() =>
        expect(view.result.current.state.kind).toBe('readable'),
      );
      const token = await act(() => view.result.current.beginWrite());
      if (!token) throw new Error('Expected a write generation');
      fetcher.mockResolvedValue(Response.json(content({ canEditContent })));
      await act(async () => {
        expect(
          await view.result.current.handleWriteError(
            new ApiError(403, 'FORBIDDEN'),
            token,
          ),
        ).toMatchObject({ canEditContent });
      });
      await waitFor(() =>
        expect(view.result.current.state).toMatchObject({
          kind: 'readable',
          canEdit: canEditContent,
        }),
      );
      expect(router.refresh).not.toHaveBeenCalled();
    },
  );
  it('late completions and denials from the previous vacancy cannot change the mounted scope', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const token = await act(() => view.result.current.beginWrite());
    if (!token) throw new Error('Expected a write generation');
    const late = deferred();
    fetcher
      .mockReturnValueOnce(late.promise)
      .mockResolvedValue(Response.json(content({ id: OTHER, version: 7 })));
    let finishing: ReturnType<typeof view.result.current.finishWrite> =
      Promise.resolve(null);
    act(() => {
      finishing = view.result.current.finishWrite(token);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    view.rerender({ id: OTHER });
    await waitFor(() =>
      expect(view.result.current.state).toMatchObject({
        kind: 'readable',
        content: { id: OTHER, version: 7 },
      }),
    );
    await act(async () => {
      late.resolve(Response.json(content({ version: 99 })));
      expect(await finishing).toBeNull();
    });
    expect(token.isCurrent()).toBe(false);
    await act(async () => {
      expect(
        await view.result.current.handleWriteError(
          new ApiError(401, 'UNAUTHENTICATED'),
          token,
        ),
      ).toBeNull();
    });
    expect(view.result.current.state).toMatchObject({
      kind: 'readable',
      content: { id: OTHER, version: 7 },
    });
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it('unmount invalidates the write generation and prevents late access adoption', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );
    const token = await act(() => view.result.current.beginWrite());
    if (!token) throw new Error('Expected a write generation');
    const finish = view.result.current.finishWrite;
    view.unmount();
    expect(token.isCurrent()).toBe(false);
    expect(await finish(token)).toBeNull();
  });
});
