// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditVacancyContent } from '@/components/vacancies/use-edit-vacancy-content';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { queryKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/api-client';
import { parseEditorDocument } from '@/lib/rich-text-editor-document';
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
  type UpdateVacancyContentInput,
} from '@/lib/schemas/vacancy-content';
import * as formModule from '@/lib/vacancy-content-form';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const doc = (text = 'New description') => ({
  type: 'doc' as const,
  content: [
    { type: 'paragraph' as const, content: [{ type: 'text' as const, text }] },
  ],
});
const initial = () =>
  vacancyContentReadSchema.parse({
    id: ID,
    version: 1,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: doc('Saved'),
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
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
let read = initial();
let get: () => Response | Promise<Response>;
let patch: (body: UpdateVacancyContentInput) => Response | Promise<Response>;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const writes = () =>
  fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH');
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  read = initial();
  get = () => Response.json(read);
  patch = (body) => {
    read = { ...read, ...body, version: read.version + 1 };
    return Response.json(formModule.baselineContent(read));
  };
  fetcher = vi.fn<typeof fetch>((_input, options) =>
    Promise.resolve(
      options?.method === 'PATCH'
        ? patch(
            updateVacancyContentSchema.parse(JSON.parse(String(options.body))),
          )
        : get(),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mount(id = ID) {
  return renderHook(
    ({ id: currentId }) => {
      const access = useVacancyContentAccess(currentId);
      return { access, edit: useEditVacancyContent({ id: currentId, access }) };
    },
    {
      initialProps: { id },
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    },
  );
}
type View = ReturnType<typeof mount>;
async function activate(view: View) {
  await waitFor(() => expect(view.result.current.edit.baseline).not.toBeNull());
  act(() => {
    view.result.current.edit.setReady('descriptionDoc', true);
    view.result.current.edit.setReady('requirementsDoc', true);
    view.result.current.edit.change(
      'descriptionDoc',
      parseEditorDocument(doc()),
    );
  });
  await waitFor(() => expect(view.result.current.edit.canSave).toBe(true));
}

describe('content form gates and intent lifetime [ADR-020]', () => {
  it('has no baseline before validated entry and one shared observer', async () => {
    const entry = deferred();
    get = () => entry.promise;
    const view = mount();
    expect(view.result.current.edit.baseline).toBeNull();
    expect(view.result.current.edit.fields).toBeNull();
    expect(view.result.current.edit.canSave).toBe(false);
    await act(async () => entry.resolve(Response.json(read)));
    await waitFor(() =>
      expect(view.result.current.edit.baseline?.version).toBe(1),
    );
    expect(
      client
        .getQueryCache()
        .find({ queryKey: queryKeys.vacancyContent(ID) })
        ?.getObserversCount(),
    ).toBe(1);
  });
  it('not-ready, unchanged and invalid documents cannot dispatch; invalid buffer stays dirty', async () => {
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.edit.baseline).not.toBeNull(),
    );
    act(() =>
      view.result.current.edit.change(
        'descriptionDoc',
        parseEditorDocument(doc()),
      ),
    );
    await act(() => view.result.current.edit.submit());
    expect(writes()).toHaveLength(0);
    act(() => {
      view.result.current.edit.setReady('descriptionDoc', true);
      view.result.current.edit.setReady('requirementsDoc', true);
      view.result.current.edit.change(
        'descriptionDoc',
        parseEditorDocument(doc('Saved')),
      );
    });
    await act(() => view.result.current.edit.submit());
    expect(view.result.current.edit.dirty).toBe(false);
    const invalid = parseEditorDocument({
      type: 'unsupported',
      input: 'private invalid text',
    });
    act(() => view.result.current.edit.change('descriptionDoc', invalid));
    expect(view.result.current.edit.invalidFields).toEqual(['descriptionDoc']);
    expect(view.result.current.edit.dirty).toBe(true);
    await act(() => view.result.current.edit.submit());
    expect(writes()).toHaveLength(0);
    expect(view.result.current.edit.fields?.descriptionDoc).toEqual({
      kind: 'replacement',
      result: invalid,
    });
  });
  it('Clear/undo retains the exact invalid buffer and blocks edits while sending', async () => {
    const view = mount();
    await activate(view);
    const invalid = parseEditorDocument('private invalid buffer');
    act(() => view.result.current.edit.change('descriptionDoc', invalid));
    const retained = view.result.current.edit.fields?.descriptionDoc;
    act(() => view.result.current.edit.clear('descriptionDoc'));
    expect(view.result.current.edit.canSave).toBe(true);
    act(() => view.result.current.edit.undoClear('descriptionDoc'));
    expect(view.result.current.edit.fields?.descriptionDoc).toBe(retained);
    act(() => view.result.current.edit.clear('descriptionDoc'));
    const sending = deferred();
    patch = () => sending.promise;
    let request: Promise<void> = Promise.resolve();
    act(() => {
      request = view.result.current.edit.submit();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    const frozen = view.result.current.edit.fields;
    act(() => {
      view.result.current.edit.undoClear('descriptionDoc');
      view.result.current.edit.change(
        'requirementsDoc',
        parseEditorDocument(doc()),
      );
    });
    expect(view.result.current.edit.fields).toBe(frozen);
    read = { ...read, version: 2, descriptionDoc: null };
    await act(async () => {
      sending.resolve(Response.json(formModule.baselineContent(read)));
      await request;
    });
    expect(view.result.current.edit.baseline?.descriptionDoc).toBeNull();
    expect(view.result.current.edit.fields?.descriptionDoc).toEqual({
      kind: 'unchanged',
    });
  });
  it('same-version background reads retain dirty state and reset keys; a newer revision stays stale until explicit reload', async () => {
    const view = mount();
    await activate(view);
    const before = view.result.current.edit.fields;
    const oldSubmit = view.result.current.edit.submit;
    await act(() => view.result.current.access.revalidate());
    expect(view.result.current.edit.fields).toBe(before);
    expect(view.result.current.edit.resetKeys.descriptionDoc).toBe(0);
    read = { ...read, version: 2, descriptionDoc: doc('Other writer') };
    await act(() => view.result.current.access.revalidate());
    await waitFor(() => expect(view.result.current.edit.stale).toBe(true));
    await act(() => oldSubmit());
    expect(writes()).toHaveLength(0);
    expect(view.result.current.edit.baseline?.version).toBe(1);
    expect(view.result.current.edit.fields).toBe(before);
    expect(view.result.current.edit.canSave).toBe(false);
    act(() =>
      view.result.current.edit.change(
        'requirementsDoc',
        parseEditorDocument(doc('Keep editing while stale')),
      ),
    );
    expect(view.result.current.edit.feedback.kind).toBe('stale');
    await act(() => view.result.current.edit.reloadConfirmed());
    expect(view.result.current.edit.baseline?.version).toBe(2);
    expect(view.result.current.edit.stale).toBe(false);
    expect(view.result.current.edit.dirty).toBe(false);
    expect(view.result.current.edit.resetKeys.descriptionDoc).toBe(1);
    expect(view.result.current.edit.ready.descriptionDoc).toBe(false);
  });
  it('transient read failure preserves same-id invalid and Clear-undo buffers plus leave protection', async () => {
    const view = mount();
    await activate(view);
    const invalid = parseEditorDocument('retained private invalid buffer');
    act(() => view.result.current.edit.change('descriptionDoc', invalid));
    const beforeClear = view.result.current.edit.fields?.descriptionDoc;
    act(() => view.result.current.edit.clear('descriptionDoc'));
    const cleared = view.result.current.edit.fields;
    get = () => problem(500, 'INTERNAL');
    await act(() => view.result.current.access.revalidate());
    expect(view.result.current.access.state).toMatchObject({
      kind: 'checking',
      error: { code: 'INTERNAL' },
    });
    expect(view.result.current.edit.baseline?.version).toBe(1);
    expect(view.result.current.edit.fields).toBe(cleared);
    expect(view.result.current.edit.protectLeave).toBe(true);
    expect(view.result.current.edit.canSave).toBe(false);
    await act(() => view.result.current.edit.submit());
    expect(writes()).toHaveLength(0);
    get = () => Response.json(read);
    await act(() => view.result.current.access.revalidate());
    await waitFor(() =>
      expect(view.result.current.access.state.kind).toBe('readable'),
    );
    expect(view.result.current.edit.fields).toBe(cleared);
    act(() => view.result.current.edit.undoClear('descriptionDoc'));
    expect(view.result.current.edit.fields?.descriptionDoc).toBe(beforeClear);
    expect(view.result.current.edit.invalidFields).toEqual(['descriptionDoc']);
  });
});

describe('content mutation lifecycle [ADR-020]', () => {
  it('an invalid editor update and save in the same event never send the previous valid buffer', async () => {
    const view = mount();
    await activate(view);
    let request: Promise<void> = Promise.resolve();
    act(() => {
      view.result.current.edit.change(
        'descriptionDoc',
        parseEditorDocument('new invalid input'),
      );
      request = view.result.current.edit.submit();
    });
    await act(async () => request);
    expect(writes()).toHaveLength(0);
    expect(view.result.current.edit.dirty).toBe(true);
  });
  it('locks before the first await, adopts canonical PATCH only locally, and permits a second edit after fresh GET', async () => {
    const view = mount();
    await activate(view);
    client.setQueryData(queryKeys.vacancies({ limit: 25 }), []);
    const sending = deferred();
    patch = () => sending.promise;
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = view.result.current.edit.submit();
      void view.result.current.edit.submit();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    read = { ...read, version: 2, descriptionDoc: doc() };
    const fresh = deferred();
    get = () => fresh.promise;
    act(() => sending.resolve(Response.json(formModule.baselineContent(read))));
    await waitFor(() =>
      expect(view.result.current.edit.baseline?.version).toBe(2),
    );
    expect(view.result.current.edit.pending).toBe(true);
    expect(view.result.current.edit.canSave).toBe(false);
    expect(client.getQueryData(queryKeys.vacancyContent(ID))).toHaveProperty(
      'status',
    );
    expect(view.result.current.edit.resetKeys.descriptionDoc).toBe(0);
    expect(
      client.getQueryState(queryKeys.vacancies({ limit: 25 }))?.isInvalidated,
    ).toBe(true);
    await act(async () => {
      fresh.resolve(Response.json(read));
      await first;
    });
    await waitFor(() => expect(view.result.current.edit.pending).toBe(false));
    get = () => Response.json(read);
    patch = (body) => {
      read = { ...read, ...body, version: 3 };
      return Response.json(formModule.baselineContent(read));
    };
    act(() => view.result.current.edit.clear('descriptionDoc'));
    await waitFor(() => expect(view.result.current.edit.canSave).toBe(true));
    await act(() => view.result.current.edit.submit());
    expect(writes()).toHaveLength(2);
    expect(JSON.parse(String(writes()[1]?.[1]?.body))).toEqual({
      expectedVersion: 2,
      descriptionDoc: null,
    });
    expect(view.result.current.edit.baseline?.version).toBe(3);
    expect(view.result.current.edit.feedback.kind).toBe('saved');
  });
  it('a lazy schema/module-load rejection sends no PATCH, retains input and unlocks', async () => {
    const view = mount();
    await activate(view);
    const before = view.result.current.edit.fields;
    vi.spyOn(formModule, 'loadContentSubmit').mockRejectedValueOnce(
      new Error('Chunk unavailable'),
    );
    await act(() => view.result.current.edit.submit());
    expect(writes()).toHaveLength(0);
    expect(view.result.current.edit.fields).toBe(before);
    expect(view.result.current.edit.feedback.kind).toBe('loadFailed');
    expect(view.result.current.edit.pending).toBe(false);
  });
  it('a shorter canonical no-op answer resets only the editor whose displayed content differs', async () => {
    const view = mount();
    await activate(view);
    patch = () => Response.json(formModule.baselineContent(read));
    await act(() => view.result.current.edit.submit());
    expect(view.result.current.edit.feedback.kind).toBe('noOp');
    expect(view.result.current.edit.dirty).toBe(false);
    expect(view.result.current.edit.resetKeys).toEqual({
      descriptionDoc: 1,
      requirementsDoc: 0,
    });
    expect(view.result.current.edit.ready).toEqual({
      descriptionDoc: false,
      requirementsDoc: true,
    });
  });
  it.each([
    [409, 'STALE_STATE', 'stale'],
    [409, 'VACANCY_CONTENT_LOCKED', 'closed'],
    [400, 'VALIDATION_FAILED', 'fields'],
    [413, 'BODY_TOO_LARGE', 'fields'],
    [429, 'RATE_LIMITED', 'rateLimited'],
    [500, 'INTERNAL', 'server'],
  ] as const)(
    '%s %s preserves edits and returns %s feedback',
    async (status, code, kind) => {
      const view = mount();
      await activate(view);
      const before = view.result.current.edit.fields;
      patch = () => problem(status, code);
      await act(() => view.result.current.edit.submit());
      expect(view.result.current.edit.fields).toBe(before);
      expect(view.result.current.edit.feedback.kind).toBe(kind);
      expect(view.result.current.edit.baseline?.version).toBe(1);
      expect(view.result.current.edit.pending).toBe(false);
      if (kind === 'fields') {
        expect(view.result.current.edit.canSave).toBe(false);
        act(() =>
          view.result.current.edit.change(
            'descriptionDoc',
            parseEditorDocument(doc('Corrected')),
          ),
        );
        expect(view.result.current.edit.feedback.kind).toBe('idle');
      }
      if (kind === 'stale' || kind === 'closed')
        expect(view.result.current.edit.canSave).toBe(false);
    },
  );
  it('ambiguous network loss checks GET without assuming that the observed version proves success', async () => {
    const view = mount();
    await activate(view);
    patch = () => {
      read = { ...read, version: 2, descriptionDoc: doc() };
      throw new TypeError('Lost response');
    };
    await act(() => view.result.current.edit.submit());
    await waitFor(() => expect(view.result.current.edit.stale).toBe(true));
    expect(view.result.current.edit.dirty).toBe(true);
    expect(view.result.current.edit.baseline?.version).toBe(1);
    expect(writes()).toHaveLength(1);
    expect(view.result.current.edit.feedback.kind).not.toBe('saved');
  });
  it.each([false, true])(
    '403 refresh retains independent read eligibility %s without rebasing dirty text',
    async (canEditContent) => {
      const view = mount();
      await activate(view);
      patch = () => {
        read = { ...read, canEditContent };
        return problem(403, 'FORBIDDEN');
      };
      const before = view.result.current.edit.fields;
      await act(() => view.result.current.edit.submit());
      await waitFor(() =>
        expect(view.result.current.access.state).toMatchObject({
          kind: 'readable',
          canEdit: canEditContent,
        }),
      );
      expect(view.result.current.edit.fields).toBe(before);
      expect(view.result.current.edit.feedback.kind).toBe('forbidden');
      expect(view.result.current.edit.canSave).toBe(canEditContent);
    },
  );
  it.each([401, 404])(
    '%s terminal denial removes baseline, invalid/Clear buffers and leave protection',
    async (status) => {
      const view = mount();
      await activate(view);
      act(() => {
        view.result.current.edit.change(
          'descriptionDoc',
          parseEditorDocument('private invalid'),
        );
      });
      act(() => view.result.current.edit.clear('descriptionDoc'));
      patch = () => {
        if (status === 404) get = () => problem(404, 'NOT_FOUND');
        return problem(
          status,
          status === 401 ? 'SESSION_EXPIRED' : 'NOT_FOUND',
        );
      };
      await act(() => view.result.current.edit.submit());
      expect(view.result.current.access.state.kind).toBe('unavailable');
      expect(view.result.current.edit.baseline).toBeNull();
      expect(view.result.current.edit.fields).toBeNull();
      expect(view.result.current.edit.protectLeave).toBe(false);
      expect(view.result.current.edit.dirty).toBe(false);
    },
  );
  it('a late old-id success cannot adopt into the next vacancy or leave its submission locked', async () => {
    const view = mount();
    await activate(view);
    const sending = deferred();
    patch = () => sending.promise;
    const oldChange = view.result.current.edit.change;
    let request: Promise<void> = Promise.resolve();
    act(() => {
      request = view.result.current.edit.submit();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    read = { ...initial(), id: OTHER, version: 7 };
    view.rerender({ id: OTHER });
    await waitFor(() =>
      expect(view.result.current.edit.baseline?.id).toBe(OTHER),
    );
    act(() =>
      oldChange(
        'descriptionDoc',
        parseEditorDocument(doc('Old resource callback')),
      ),
    );
    await act(async () => {
      sending.resolve(
        Response.json(formModule.baselineContent({ ...initial(), version: 2 })),
      );
      await request;
    });
    expect(view.result.current.edit.baseline?.version).toBe(7);
    expect(view.result.current.edit.pending).toBe(false);
    expect(view.result.current.edit.dirty).toBe(false);
    expect(view.result.current.edit.feedback.kind).toBe('idle');
  });
  it('late completion after unmount neither repopulates the content cache nor rejects unhandled', async () => {
    const view = mount();
    await activate(view);
    const sending = deferred();
    client.setQueryData(queryKeys.vacancies({ limit: 25 }), []);
    client.setQueryData(queryKeys.vacancy(ID), { id: ID });
    patch = () => sending.promise;
    let request: Promise<void> = Promise.resolve();
    act(() => {
      request = view.result.current.edit.submit();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    view.unmount();
    sending.resolve(
      Response.json(formModule.baselineContent({ ...read, version: 2 })),
    );
    await expect(request).resolves.toBeUndefined();
    expect(
      client.getQueryState(queryKeys.vacancies({ limit: 25 }))?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(queryKeys.vacancy(ID))?.isInvalidated).toBe(
      true,
    );
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === 'GET'),
    ).toHaveLength(1);
    expect(client.getQueryData(queryKeys.vacancyContent(ID))).not.toMatchObject(
      { version: 2 },
    );
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.vacancyContent(ID))).toBeUndefined(),
    );
  });
  it('a confirmed late success after terminal denial invalidates harmlessly without recreating data or reads', async () => {
    const view = mount();
    await activate(view);
    const sending = deferred();
    patch = () => sending.promise;
    let request: Promise<void> = Promise.resolve();
    act(() => {
      request = view.result.current.edit.submit();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    await act(() =>
      view.result.current.access.handleWriteError(
        new ApiError(401, 'SESSION_EXPIRED'),
      ),
    );
    const calls = fetcher.mock.calls.length;
    await act(async () => {
      sending.resolve(
        Response.json(formModule.baselineContent({ ...read, version: 2 })),
      );
      await request;
    });
    expect(fetcher.mock.calls.length).toBe(calls);
    expect(client.getQueryData(queryKeys.vacancyContent(ID))).toBeUndefined();
    expect(view.result.current.edit.baseline).toBeNull();
    expect(view.result.current.edit.fields).toBeNull();
    expect(view.result.current.edit.protectLeave).toBe(false);
  });
});
