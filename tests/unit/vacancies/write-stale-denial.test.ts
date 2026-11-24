// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { useDraftClose } from '@/components/vacancies/use-draft-close';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import type { CloseKind } from '@/lib/vacancy-draft-close';
import { publishFromList } from '@/lib/vacancy-draft-publish';
import { createAttemptKeys, submitEdit } from '@/lib/vacancy-edit-submit';
import { putStatus, toggleStatus } from '@/lib/vacancy-status-change';
import { attemptTeamWrite } from '@/lib/vacancy-team';
import { changeUrgency } from '@/lib/vacancy-urgency-change';
import messages from '@/messages/uk.json';
import { SHARE_ID, shareVacancy } from '../../support/vacancy-share-harness';

const { router, toast } = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn() },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/toast', () => ({ toast }));

const KEY = queryKeys.vacancy(SHARE_ID);
const openCard = (): VacancyDetail =>
  shareVacancy({
    status: 'OPEN',
    priority: 'NORMAL',
    statusActions: ['HOLD', 'CANCEL'],
    version: 3,
  });
const draftCard = (): VacancyDetail =>
  shareVacancy({
    status: 'DRAFT',
    openedAt: null,
    position: { id: '3f1e2d3c-4b5a-4968-8776-655443322110', name: 'Медіабаєр' },
    version: 3,
  });
const held = (seed: VacancyDetail): VacancyDetail => ({
  ...seed,
  status: 'ON_HOLD',
  statusActions: ['RESUME', 'CANCEL'],
  version: 4,
});
const published = (seed: VacancyDetail): VacancyDetail => ({
  ...seed,
  status: 'OPEN',
  openedAt: '2026-11-20T08:00:00.000Z',
  version: 4,
});
const publishHooks = {
  removed: () => undefined,
  restored: () => undefined,
  settled: () => undefined,
};

const flows = {
  status: {
    seed: openCard,
    done: held,
    run: (client: QueryClient) =>
      toggleStatus(client, {
        id: SHARE_ID,
        number: 'V-0005',
        action: 'HOLD',
        version: 3,
        unassigned: false,
      }),
  },
  urgency: {
    seed: openCard,
    done: (seed: VacancyDetail): VacancyDetail => ({
      ...seed,
      priority: 'URGENT',
      version: 4,
    }),
    run: (client: QueryClient) =>
      changeUrgency(client, {
        id: SHARE_ID,
        number: 'V-0005',
        from: 'NORMAL',
        to: 'URGENT',
        version: 3,
      }),
  },
  'publish from list': {
    seed: draftCard,
    done: published,
    run: (client: QueryClient) =>
      publishFromList(client, SHARE_ID, publishHooks),
  },
  'publish from form': {
    seed: draftCard,
    done: published,
    run: (client: QueryClient) =>
      submitEdit(client, createAttemptKeys(), {
        id: SHARE_ID,
        version: 3,
        action: 'PUBLISH',
        changes: null,
        everything: {},
        hasSalaryAmount: false,
      }),
  },
  'team or dialog status': {
    seed: openCard,
    done: held,
    run: (client: QueryClient) =>
      attemptTeamWrite(client, SHARE_ID, () =>
        putStatus(SHARE_ID, { action: 'HOLD', expectedVersion: 3 }),
      ),
  },
} as const;
const names = Object.keys(flows) as (keyof typeof flows)[];

const contentBody = {
  id: SHARE_ID,
  version: 3,
  updatedAt: '2026-11-19T08:00:00Z',
  descriptionDoc: null,
  requirementsDoc: null,
  status: 'OPEN',
  canEditContent: true,
};

function deferred() {
  let resolve: (value: Response) => void = () => undefined;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

/** Routes the write, the detail read and the content read to answers each test controls. */
function stubServer() {
  const write = deferred();
  const detail = deferred();
  const server = {
    write,
    detail,
    writing: false,
    content: (): Response => Response.json(contentBody),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((url, init) => {
      if (
        init?.method === 'PUT' ||
        init?.method === 'POST' ||
        init?.method === 'DELETE'
      ) {
        server.writing = true;
        return write.promise;
      }
      if (String(url).endsWith('/content'))
        return Promise.resolve(server.content());
      return String(url).includes(SHARE_ID)
        ? detail.promise
        : Promise.resolve(Response.json({ items: [] }));
    }),
  );
  return server;
}

let client: QueryClient;
const mountAccess = () =>
  renderHook(() => useVacancyContentAccess(SHARE_ID), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client, children }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe('an older detail read cannot outlive a write [VAC-02, VAC-08]', () => {
  it.each(names)('%s keeps the server answer', async (name) => {
    const flow = flows[name];
    const seed = flow.seed();
    const server = stubServer();
    client.setQueryData(KEY, seed);

    const running = flow.run(client);
    await vi.waitFor(() => expect(server.writing).toBe(true));
    const oldRead = client
      .fetchQuery({ ...vacancyDetailQuery(SHARE_ID), staleTime: 0 })
      .catch(() => undefined);
    server.write.resolve(Response.json(flow.done(seed)));
    await running;
    server.detail.resolve(Response.json(seed));
    await oldRead;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(client.getQueryData(KEY)).toEqual(flow.done(seed));
  });

  it.each(['publish from list', 'publish from form'] as const)(
    '%s marks the detail for a re-read',
    async (name) => {
      const flow = flows[name];
      const seed = flow.seed();
      const server = stubServer();
      client.setQueryData(KEY, seed);
      server.write.resolve(Response.json(flow.done(seed)));

      await flow.run(client);

      expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
      expect(client.getQueryData(KEY)).toEqual(flow.done(seed));
    },
  );
});

describe('a write answered after a denial leaves the cache empty [VAC-08, ADR-020]', () => {
  const denials = [
    ['not found', 404, 'NOT_FOUND'],
    ['session lost', 401, 'UNAUTHENTICATED'],
  ] as const;
  const matrix = names.flatMap((name) =>
    denials.map(
      ([label, status, code]) => [name, label, status, code] as const,
    ),
  );

  it.each(matrix)('%s after %s', async (name, _label, status, code) => {
    const flow = flows[name];
    const seed = flow.seed();
    const server = stubServer();
    client.setQueryData(KEY, seed);
    const view = mountAccess();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );

    const running = flow.run(client);
    await vi.waitFor(() => expect(server.writing).toBe(true));
    server.content = () => Response.json({ code }, { status });
    await act(async () => {
      await view.result.current.revalidate();
    });
    expect(view.result.current.state.kind).toBe('unavailable');
    expect(client.getQueryData(KEY)).toBeUndefined();

    server.write.resolve(Response.json(flow.done(seed)));
    await act(async () => {
      await running;
    });

    expect(client.getQueryData(KEY)).toBeUndefined();
  });
});

describe('a viewer who keeps access still gets the write [VAC-08]', () => {
  it.each(names)('%s landing after unmount', async (name) => {
    const flow = flows[name];
    const seed = flow.seed();
    const server = stubServer();
    client.setQueryData(KEY, seed);
    const view = mountAccess();
    await waitFor(() =>
      expect(view.result.current.state.kind).toBe('readable'),
    );

    const running = flow.run(client);
    await vi.waitFor(() => expect(server.writing).toBe(true));
    view.unmount();
    server.write.resolve(Response.json(flow.done(seed)));
    await running;

    expect(client.getQueryData(KEY)).toEqual(flow.done(seed));
  });

  it('a denial of another vacancy does not block this one', async () => {
    const flow = flows.status;
    const seed = flow.seed();
    const server = stubServer();
    client.setQueryData(KEY, seed);
    const other = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
    const view = renderHook(() => useVacancyContentAccess(other), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    });
    await waitFor(() =>
      expect(view.result.current.state.kind).not.toBe('checking'),
    );

    const running = flow.run(client);
    await vi.waitFor(() => expect(server.writing).toBe(true));
    server.content = () =>
      Response.json({ code: 'NOT_FOUND' }, { status: 404 });
    await act(async () => {
      await view.result.current.revalidate();
    });
    server.write.resolve(Response.json(flow.done(seed)));
    await act(async () => {
      await running;
    });

    expect(view.result.current.state.kind).toBe('unavailable');
    expect(client.getQueryData(KEY)).toEqual(flow.done(seed));
  });
});

describe('closing a draft respects a denial [VAC-08, D112, D113]', () => {
  const closable = {
    id: SHARE_ID,
    number: 'V-0005',
    title: 'Медіабаєр',
    status: 'DRAFT',
    vertical: { id: '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70' },
  } as const;
  const cancelled: VacancyDetail = {
    ...draftCard(),
    status: 'CANCELLED',
    version: 4,
  };
  const closeAnswer = (kind: CloseKind) =>
    Response.json(kind === 'cancel' ? cancelled : { id: SHARE_ID });
  const closedDetail = (kind: CloseKind) =>
    kind === 'cancel' ? cancelled : undefined;

  function CloseHarness({ kind }: { readonly kind: CloseKind }) {
    const { openDialog, dialog } = useDraftClose(closable);
    return createElement(
      'div',
      null,
      createElement(
        'button',
        { type: 'button', onClick: () => openDialog(kind) },
        'open-close',
      ),
      dialog,
    );
  }

  async function pressClose(kind: CloseKind) {
    const view = render(
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        timeZone: 'Europe/Kyiv',
        messages,
        children: createElement(QueryClientProvider, {
          client,
          children: createElement(CloseHarness, { kind }),
        }),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'open-close' }));
    if (kind === 'cancel')
      fireEvent.change(
        screen.getByRole('textbox', {
          name: new RegExp(messages.vacancies.draft.close.cancel.reasonLabel),
        }),
        { target: { value: 'Дубль' } },
      );
    await userEvent.click(
      screen.getByRole('button', {
        name: messages.vacancies.draft.close[kind].confirm,
      }),
    );
    return view;
  }
  const announced = () =>
    waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });

  beforeAll(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it.each([
    ['cancel', 'not found', 404, 'NOT_FOUND'],
    ['cancel', 'session lost', 401, 'UNAUTHENTICATED'],
    ['delete', 'not found', 404, 'NOT_FOUND'],
    ['delete', 'session lost', 401, 'UNAUTHENTICATED'],
  ] as const)('%s answered after %s', async (kind, _label, status, code) => {
    const server = stubServer();
    client.setQueryData(KEY, draftCard());
    const access = mountAccess();
    await waitFor(() =>
      expect(access.result.current.state.kind).toBe('readable'),
    );
    await pressClose(kind);
    await waitFor(() => expect(server.writing).toBe(true));

    server.content = () => Response.json({ code }, { status });
    await act(async () => {
      await access.result.current.revalidate();
    });
    expect(client.getQueryData(KEY)).toBeUndefined();
    server.write.resolve(closeAnswer(kind));
    await announced();

    expect(client.getQueryData(KEY)).toBeUndefined();
  });

  it.each(['cancel', 'delete'] as const)(
    '%s reaches a viewer who keeps access',
    async (kind) => {
      const server = stubServer();
      client.setQueryData(KEY, draftCard());
      await pressClose(kind);
      await waitFor(() => expect(server.writing).toBe(true));

      server.write.resolve(closeAnswer(kind));
      await announced();

      expect(client.getQueryData(KEY)).toEqual(closedDetail(kind));
    },
  );

  it.each(['cancel', 'delete'] as const)(
    '%s landing after unmount still updates the cache',
    async (kind) => {
      const server = stubServer();
      client.setQueryData(KEY, draftCard());
      const view = await pressClose(kind);
      await waitFor(() => expect(server.writing).toBe(true));
      view.unmount();

      server.write.resolve(closeAnswer(kind));
      await announced();

      expect(client.getQueryData(KEY)).toEqual(closedDetail(kind));
    },
  );
});
