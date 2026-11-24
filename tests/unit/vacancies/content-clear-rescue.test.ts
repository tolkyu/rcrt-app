// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react';
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
import Runtime from '@/components/rich-text/rich-text-editor-runtime';
import { useEditVacancyContent } from '@/components/vacancies/use-edit-vacancy-content';
import { useVacancyContentAccess } from '@/components/vacancies/use-vacancy-content-access';
import { parseEditorDocument } from '@/lib/rich-text-editor-document';
import { richTextDocSchema } from '@/lib/schemas/rich-text';
import { vacancyContentReadSchema } from '@/lib/schemas/vacancy-content';
import { baselineContent } from '@/lib/vacancy-content-form';
import messages from '@/messages/uk.json';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const STORED_LENGTH = 49_826;

const list = (text: string) => ({
  type: 'orderedList',
  content: [
    {
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  ],
});
const documentOf = (size: number, first: number) => ({
  type: 'doc',
  content: Array.from({ length: 100 }, (_, index) =>
    list('я'.repeat(index === 0 ? size + first : size)),
  ),
});

/** Valid as stored, but Tiptap adds `attrs.start` to each list and pushes it past the 50,000 limit. */
function storedDocument() {
  const overhead = JSON.stringify(documentOf(1, 0)).length;
  const room = STORED_LENGTH - overhead;
  return documentOf(1 + Math.floor(room / 100), room % 100);
}
const replacement = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Нове' }] }],
};

let client: QueryClient;
let patches: unknown[];

beforeAll(() => {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  patches = [];
  let read = vacancyContentReadSchema.parse({
    id: ID,
    version: 1,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: storedDocument(),
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method !== 'PATCH') return Response.json(read);
      const body: unknown = JSON.parse(String(init.body));
      patches.push(body);
      read = vacancyContentReadSchema.parse({
        ...read,
        ...(body as object),
        version: read.version + 1,
      });
      return Response.json(baselineContent(read));
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

async function openRejected() {
  const view = renderHook(
    () => {
      const access = useVacancyContentAccess(ID);
      return { access, edit: useEditVacancyContent({ id: ID, access }) };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client, children }),
    },
  );
  await waitFor(() => expect(view.result.current.edit.baseline).not.toBeNull());
  act(() => {
    view.result.current.edit.setReady('descriptionDoc', false);
    view.result.current.edit.setReady('requirementsDoc', true);
    view.result.current.edit.change(
      'requirementsDoc',
      parseEditorDocument(replacement),
    );
  });
  return view;
}

describe('Clear rescues a stored document the editor rejects [VAC-08, ADR-020]', () => {
  it('the real editor schema rejects the stored document', async () => {
    const stored = richTextDocSchema.parse(storedDocument());
    expect(JSON.stringify(stored)).toHaveLength(STORED_LENGTH);
    const onReadyChange = vi.fn();
    render(
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        messages: { richText: messages.richText },
        children: createElement(Runtime, {
          id: 'description',
          fieldLabel: 'Опис',
          resetKey: 'one',
          initialDocument: stored,
          disabled: false,
          onChange: vi.fn(),
          onReadyChange,
        }),
      }),
    );
    await waitFor(() => expect(onReadyChange).toHaveBeenCalledWith(false));
    expect(onReadyChange).not.toHaveBeenCalledWith(true);
  });

  it('Clear enables Save and the other field is saved with it', async () => {
    const view = await openRejected();
    expect(view.result.current.edit.canSave).toBe(false);
    act(() => view.result.current.edit.clear('descriptionDoc'));
    await waitFor(() => expect(view.result.current.edit.canSave).toBe(true));
    await act(async () => {
      await view.result.current.edit.submit();
    });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      descriptionDoc: null,
      requirementsDoc: replacement,
    });
  });

  it('undoing Clear blocks Save again', async () => {
    const view = await openRejected();
    act(() => view.result.current.edit.clear('descriptionDoc'));
    await waitFor(() => expect(view.result.current.edit.canSave).toBe(true));
    act(() => view.result.current.edit.undoClear('descriptionDoc'));
    await waitFor(() => expect(view.result.current.edit.canSave).toBe(false));
  });
});
