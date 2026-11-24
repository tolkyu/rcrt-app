// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyContentEditForm } from '@/components/vacancies/vacancy-content-edit-form';
import { vacancyContentClientMessages } from '@/lib/i18n/vacancy-content-messages';
import { queryKeys } from '@/lib/query-keys';
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
  type UpdateVacancyContentInput,
} from '@/lib/schemas/vacancy-content';
import { baselineContent } from '@/lib/vacancy-content-form';
import messages from '@/messages/uk.json';

const { router, editorState } = vi.hoisted(() => ({
  router: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
  editorState: { autoReady: true },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => createElement('a', { href, ...props }, children),
}));
vi.mock('@/components/rich-text/rich-text-editor', async () => {
  const {
    createElement: h,
    Fragment,
    useEffect,
    useRef,
  } = await import('react');
  const { parseEditorDocument: parse } =
    await import('@/lib/rich-text-editor-document');
  const typed = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Typed' }] },
    ],
  };
  const badLink = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ],
  };
  return {
    RichTextEditor: (props: {
      id: string;
      disabled: boolean;
      'aria-describedby'?: string;
      'aria-labelledby'?: string;
      onChange: (result: ReturnType<typeof parse>) => void;
      onReadyChange: (ready: boolean) => void;
      onLoadFailedChange?: (failed: boolean) => void;
    }) => {
      const ready = useRef(props.onReadyChange);
      useEffect(() => {
        ready.current = props.onReadyChange;
      });
      useEffect(() => {
        ready.current(editorState.autoReady);
        return () => ready.current(false);
      }, []);
      return h(
        Fragment,
        null,
        h('div', {
          role: 'textbox',
          id: props.id,
          tabIndex: 0,
          'aria-labelledby': props['aria-labelledby'],
          'aria-describedby': props['aria-describedby'],
          'data-disabled': String(props.disabled),
        }),
        h('button', {
          type: 'button',
          'data-testid': `type-${props.id}`,
          onClick: () => props.onChange(parse(typed)),
        }),
        h('button', {
          type: 'button',
          'data-testid': `bad-${props.id}`,
          onClick: () => props.onChange(parse(badLink)),
        }),
        h('button', {
          type: 'button',
          'data-testid': `ready-${props.id}`,
          onClick: () => props.onReadyChange(true),
        }),
        h('button', {
          type: 'button',
          'data-testid': `fail-${props.id}`,
          onClick: () => props.onLoadFailedChange?.(true),
        }),
        h('button', {
          type: 'button',
          'data-testid': `loaded-${props.id}`,
          onClick: () => props.onLoadFailedChange?.(false),
        }),
      );
    },
  };
});

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const DESCRIPTION = 'vacancy-content-description';
const t = messages.vacancies.contentEdit;
const doc = (text: string) => ({
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
    descriptionDoc: doc('Saved description'),
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
  });
const problem = (
  status: number,
  code: string,
  errors?: { path: string; code: string }[],
) => Response.json({ code, ...(errors ? { errors } : {}) }, { status });
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
let intlErrors: unknown[];
const writes = () =>
  fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH');
const bodies = () =>
  writes().map(([, init]) => JSON.parse(String(init?.body)) as unknown);

const scrolled = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = scrolled;
  editorState.autoReady = true;
  intlErrors = [];
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  read = initial();
  get = () => Response.json(read);
  patch = (body) => {
    read = { ...read, ...body, version: read.version + 1 };
    return Response.json(baselineContent(read));
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function mount() {
  const form = createElement(VacancyContentEditForm, {
    vacancy: { id: ID, number: 'V-0015', title: 'Медіабаєр' },
  });
  const intl = createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: vacancyContentClientMessages(messages),
    onError: (error: unknown) => intlErrors.push(error),
    children: form,
  });
  return render(createElement(QueryClientProvider, { client, children: intl }));
}
const save = () => screen.getByRole('button', { name: t.save });
const saveEnabled = () => save().getAttribute('aria-disabled') !== 'true';
const type = (id = DESCRIPTION) =>
  fireEvent.click(screen.getByTestId(`type-${id}`));
async function editable() {
  mount();
  await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
}
async function typeAndSave() {
  await editable();
  type();
  await waitFor(() => expect(saveEnabled()).toBe(true));
  fireEvent.click(save());
}

describe('content page state selection [ADR-020]', () => {
  it('shows a reserved skeleton and no editor before the entry read finishes', async () => {
    const entry = deferred();
    get = () => entry.promise;
    mount();
    expect(screen.getByRole('status').textContent).toContain(
      messages.states.loading,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    await act(async () => entry.resolve(Response.json(read)));
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
    expect(intlErrors).toEqual([]);
  });
  it('renders the read-only view with the way back and no editors when not eligible', async () => {
    read = { ...read, canEditContent: false };
    mount();
    await screen.findByText(t.noPermission);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Saved description')).toBeTruthy();
    expect(screen.getByText(t.emptyRequirements)).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: t.back })
        .map((a) => a.getAttribute('href')),
    ).toEqual([`/vacancies/${ID}`, `/vacancies/${ID}`]);
  });
  it('links an own draft to the draft flow without documents or editors', async () => {
    read = { ...read, status: 'DRAFT', canEditContent: true };
    mount();
    const link = await screen.findByRole('link', { name: t.draftLink });
    expect(link.getAttribute('href')).toBe(`/vacancies/${ID}/edit`);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('Saved description')).toBeNull();
  });
  it.each([
    ['FILLED', t.filled],
    ['CANCELLED', t.cancelled],
  ] as const)(
    '%s is read-only even when the capability flag is true',
    async (status, text) => {
      read = { ...read, status };
      mount();
      await screen.findByText(text);
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );
  it('terminal 404 renders no cached document and the unavailable state', async () => {
    get = () => problem(404, 'NOT_FOUND');
    mount();
    await screen.findByText(t.unavailableTitle);
    expect(screen.queryByText('Saved description')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('a failed entry read shows a retry, never writable empty editors', async () => {
    get = () => problem(500, 'INTERNAL');
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(messages.states.errorTitle);
    expect(screen.queryByRole('textbox')).toBeNull();
    get = () => Response.json(read);
    fireEvent.click(
      screen.getByRole('button', { name: messages.common.retry }),
    );
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
  });
  it('a failed check keeps the heading and card link without the vacancy subtitle', async () => {
    get = () => problem(500, 'INTERNAL');
    mount();
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.title);
    expect(
      screen.getByRole('link', { name: t.back }).getAttribute('href'),
    ).toBe(`/vacancies/${ID}`);
    expect(screen.queryByText(/V-0015/)).toBeNull();
  });
  it('limits the form to 720 px from md up and leaves the unavailable state unframed', async () => {
    const view = mount();
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
    expect(
      view.container.querySelector('form')?.closest('.md\\:max-w-\\[720px\\]'),
    ).not.toBeNull();
    view.unmount();
    client.clear();
    get = () => problem(404, 'NOT_FOUND');
    const denied = mount();
    await screen.findByText(t.unavailableTitle);
    expect(
      denied.container.querySelector('.md\\:max-w-\\[720px\\]'),
    ).toBeNull();
  });
});

describe('save result stays on screen (B2, P8)', () => {
  it('shows the success status inside the sticky footer', async () => {
    await typeAndSave();
    const status = await screen.findByText(t.saved);
    expect(status.closest('[data-slot="form-page-footer"]')).not.toBeNull();
    expect(scrolled).not.toHaveBeenCalled();
  });
  it('brings a failed save alert into view without moving focus', async () => {
    patch = () => problem(500, 'INTERNAL');
    await typeAndSave();
    await screen.findByText(t.feedback.server);
    const active = document.activeElement;
    await waitFor(() =>
      expect(scrolled).toHaveBeenCalledExactlyOnceWith({ block: 'start' }),
    );
    expect(document.activeElement).toBe(active);
  });
  it('a field error keeps editor focus and does not scroll to the alerts', async () => {
    patch = () =>
      problem(400, 'VALIDATION', [
        { path: 'body.descriptionDoc', code: 'too_big' },
      ]);
    await typeAndSave();
    await screen.findByText(t.errors.too_large);
    expect(scrolled).not.toHaveBeenCalled();
  });
  it('a background version change never scrolls the page while typing', async () => {
    await editable();
    type();
    read = { ...read, version: 2 };
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.vacancyContent(ID) });
    });
    await screen.findByText(t.stale);
    expect(scrolled).not.toHaveBeenCalled();
  });
  it('explains a pristine Save and drops the reason once the form is dirty', async () => {
    await editable();
    const reasonId = save().getAttribute('aria-describedby');
    const reason = document.getElementById(reasonId!);
    expect(reason?.textContent).toBe(t.saveNoChanges);
    expect(reason?.className).toContain('[@media(hover:none)]:not-sr-only');
    const wrapper = save().parentElement!;
    type();
    await waitFor(() => expect(saveEnabled()).toBe(true));
    expect(save().getAttribute('aria-describedby')).toBeNull();
    expect(wrapper.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });
  it('does not say «no changes» next to a save result (M1)', async () => {
    await typeAndSave();
    await screen.findByText(t.saved);
    await waitFor(() => expect(saveEnabled()).toBe(false));
    expect(screen.queryByText(t.saveNoChanges)).toBeNull();
    expect(save().getAttribute('aria-describedby')).toBeNull();
  });
  it('does not say «no changes» when an editor failed to load (M1)', async () => {
    editorState.autoReady = false;
    await editable();
    fireEvent.click(screen.getByTestId(`fail-${DESCRIPTION}`));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: t.clear, hidden: true })[0]!
          .getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    expect(screen.queryByText(t.saveNoChanges)).toBeNull();
    expect(saveEnabled()).toBe(false);
  });
});

describe('Clear follows the editor chunk', () => {
  const clearButton = () =>
    screen.getAllByRole('button', { name: t.clear, hidden: true })[0]!;
  it('stays available for a loaded editor that is not ready, the way out of an invalid stored document', async () => {
    editorState.autoReady = false;
    await editable();
    expect(clearButton().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(clearButton());
    await screen.findByText(t.cleared);
    expect(saveEnabled()).toBe(false);
  });
  it('blocks Clear with a reason only after a chunk failure, until retry succeeds, without changing Save gating', async () => {
    editorState.autoReady = false;
    await editable();
    fireEvent.click(screen.getByTestId(`fail-${DESCRIPTION}`));
    const blocked = clearButton();
    await waitFor(() =>
      expect(blocked.getAttribute('aria-disabled')).toBe('true'),
    );
    await waitFor(() =>
      expect(blocked.getAttribute('aria-describedby')).toBeTruthy(),
    );
    expect(
      document.getElementById(blocked.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe(t.clearNeedsEditor);
    fireEvent.click(blocked);
    expect(screen.queryByText(t.cleared)).toBeNull();

    fireEvent.click(screen.getByTestId(`loaded-${DESCRIPTION}`));
    await waitFor(() =>
      expect(clearButton().getAttribute('aria-disabled')).toBeNull(),
    );
    fireEvent.click(screen.getByTestId(`ready-${DESCRIPTION}`));
    type();
    expect(saveEnabled()).toBe(false);
    fireEvent.click(screen.getByTestId('ready-vacancy-content-requirements'));
    await waitFor(() => expect(saveEnabled()).toBe(true));

    fireEvent.click(clearButton());
    await screen.findByText(t.cleared);
    expect(
      screen
        .getByRole('button', { name: t.undoClear })
        .getAttribute('aria-disabled'),
    ).toBeNull();
  });
});

describe('content form wiring [ADR-020]', () => {
  it('labels both editors and gates Save on a dirty valid ready field', async () => {
    await editable();
    expect(screen.getByRole('textbox', { name: t.description })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: t.requirements })).toBeTruthy();
    expect(saveEnabled()).toBe(false);
    fireEvent.click(save());
    expect(writes()).toHaveLength(0);
    type();
    await waitFor(() => expect(saveEnabled()).toBe(true));
  });
  it('sends only the dirty key with the loaded version, announces success and resets the gate', async () => {
    await typeAndSave();
    await screen.findByText(t.saved);
    expect(bodies()).toEqual([
      { expectedVersion: 1, descriptionDoc: doc('Typed') },
    ]);
    expect(saveEnabled()).toBe(false);
    expect(screen.getByRole('status').textContent).toBe(t.saved);
  });
  it('Ctrl+Enter and a double press send exactly one request', async () => {
    const sending = deferred();
    patch = () => sending.promise;
    await editable();
    type();
    await waitFor(() => expect(saveEnabled()).toBe(true));
    const button = save();
    const box = screen.getAllByRole('textbox')[0]!;
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(
      screen.getByRole('button', { name: t.saving }).getAttribute('aria-busy'),
    ).toBe('true');
    await act(async () =>
      sending.resolve(Response.json(baselineContent(read))),
    );
    expect(writes()).toHaveLength(1);
  });
  it('plain Enter and composing Ctrl+Enter do not save', async () => {
    await editable();
    type();
    await waitFor(() => expect(saveEnabled()).toBe(true));
    const box = screen.getAllByRole('textbox')[0]!;
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(writes()).toHaveLength(0);
  });
  it('ordinary Cancel still guards dirty input until the user confirms leaving', async () => {
    await editable();
    type();
    await waitFor(() => expect(saveEnabled()).toBe(true));
    const cancel = screen.getByRole('link', { name: t.cancel });
    fireEvent.click(cancel);
    await screen.findByRole('alertdialog', {
      name: messages.common.leaveTitle,
    });
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: messages.common.leaveStay }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.getElementById(DESCRIPTION)).not.toBeNull();
    fireEvent.click(cancel);
    await screen.findByRole('alertdialog', {
      name: messages.common.leaveTitle,
    });
    fireEvent.click(
      screen.getByRole('button', { name: messages.common.leaveConfirm }),
    );
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(`/vacancies/${ID}`);
    expect(writes()).toHaveLength(0);
  });
  it('Clear keeps the editor mounted, Undo restores it, and a saved clear sends null', async () => {
    await editable();
    fireEvent.click(screen.getAllByRole('button', { name: t.clear })[0]!);
    expect(screen.getByText(t.cleared)).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(document.getElementById(DESCRIPTION)).not.toBeNull();
    await waitFor(() => expect(saveEnabled()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: t.undoClear }));
    expect(screen.queryByText(t.cleared)).toBeNull();
    await waitFor(() => expect(saveEnabled()).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: t.clear })[0]!);
    await waitFor(() => expect(saveEnabled()).toBe(true));
    fireEvent.click(save());
    await screen.findByText(t.saved);
    expect(bodies()).toEqual([{ expectedVersion: 1, descriptionDoc: null }]);
  });
  it('disables Clear when the field is already empty and unchanged', async () => {
    await editable();
    expect(
      (screen.getAllByRole('button', { name: t.clear })[1] as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it('an invalid editor result shows its field error and blocks Save', async () => {
    await editable();
    fireEvent.click(screen.getByTestId(`bad-${DESCRIPTION}`));
    await screen.findByText(t.errors.invalid_link);
    expect(saveEnabled()).toBe(false);
    expect(
      screen.getByRole('textbox', {
        name: t.description,
        description: t.errors.invalid_link,
      }),
    ).toBeTruthy();
    type();
    await waitFor(() =>
      expect(screen.queryByText(t.errors.invalid_link)).toBeNull(),
    );
  });
});

describe('content save outcomes [ADR-020]', () => {
  it.each([401, 403, 404])(
    'terminal access loss releases the dirty guard before teardown (%s)',
    async (status) => {
      const back = vi
        .spyOn(window.history, 'back')
        .mockImplementation(() => {});
      try {
        patch = () => {
          const code =
            status === 401
              ? 'UNAUTHORIZED'
              : status === 403
                ? 'FORBIDDEN'
                : 'NOT_FOUND';
          get = () => problem(status, code);
          return problem(status, code);
        };
        await editable();
        type();
        fireEvent.click(screen.getAllByRole('button', { name: t.clear })[0]!);
        await waitFor(() => expect(saveEnabled()).toBe(true));
        expect(window.history.state.__leaveGuard).toEqual(expect.any(String));
        fireEvent.click(save());
        await waitFor(() =>
          expect(document.getElementById(DESCRIPTION)).toBeNull(),
        );
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.queryByRole('button', { name: t.undoClear })).toBeNull();
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(
          client.getQueryData(queryKeys.vacancyContent(ID)),
        ).toBeUndefined();
        if (status === 401) expect(router.refresh).toHaveBeenCalledOnce();
        expect(back).not.toHaveBeenCalled();
      } finally {
        back.mockRestore();
      }
    },
  );
  it('409 STALE_STATE keeps the edit, blocks Save, and reloads only after confirmation', async () => {
    patch = () => {
      read = { ...read, version: 2, descriptionDoc: doc('Elsewhere') };
      return problem(409, 'STALE_STATE');
    };
    await typeAndSave();
    await screen.findByText(t.stale);
    expect(saveEnabled()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: t.reload }));
    await screen.findByText(t.reloadTitle);
    expect(writes()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: t.reloadConfirm }));
    await waitFor(() => expect(screen.queryByText(t.stale)).toBeNull());
    expect(writes()).toHaveLength(1);
  });
  it('409 VACANCY_CONTENT_LOCKED blocks writes, keeps the text selectable and explains FILLED', async () => {
    patch = () => {
      read = { ...read, status: 'FILLED' };
      return problem(409, 'VACANCY_CONTENT_LOCKED');
    };
    await typeAndSave();
    await screen.findByText(t.filled);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(
      screen.getAllByRole('textbox')[0]!.getAttribute('data-disabled'),
    ).toBe('true');
    expect(saveEnabled()).toBe(false);
    expect(writes()).toHaveLength(1);
  });
  it.each([false, true])(
    '403 shows the changed-permission message (read still editable: %s)',
    async (canEditContent) => {
      patch = () => {
        read = { ...read, canEditContent };
        return problem(403, 'FORBIDDEN');
      };
      await typeAndSave();
      await screen.findByText(t.permissionLost);
      expect(writes()).toHaveLength(1);
      expect(screen.getAllByRole('textbox')).toHaveLength(2);
    },
  );
  it('a GET 403 after a 403 save removes the engaged form and renders no documents', async () => {
    patch = () => {
      get = () => problem(403, 'FORBIDDEN');
      return problem(403, 'FORBIDDEN');
    };
    await typeAndSave();
    await screen.findByText(t.unavailableTitle);
    expect(writes()).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('Saved description')).toBeNull();
    expect(screen.queryByText('Typed')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('400 focuses the failing editor with a summary link and a translated field error', async () => {
    patch = () =>
      problem(400, 'VALIDATION_FAILED', [
        { path: 'body.descriptionDoc.content.0', code: 'custom' },
      ]);
    await typeAndSave();
    await screen.findByText(t.errors.invalid, { selector: 'p' });
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(DESCRIPTION)),
    );
    expect(
      screen.getByRole('link', { name: t.description }).getAttribute('href'),
    ).toBe(`#${DESCRIPTION}`);
    expect(saveEnabled()).toBe(false);
    expect(screen.queryByText('custom')).toBeNull();
  });
  it('413 without a field shows the size message and keeps the input', async () => {
    patch = () => problem(413, 'BODY_TOO_LARGE');
    await typeAndSave();
    await screen.findByText(t.errors.too_large);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });
  it('a 5xx offers a retry that repeats the same save, then succeeds', async () => {
    let calls = 0;
    patch = (body) => {
      calls += 1;
      if (calls === 1) return problem(500, 'INTERNAL');
      read = { ...read, ...body, version: read.version + 1 };
      return Response.json(baselineContent(read));
    };
    await typeAndSave();
    await screen.findByText(t.feedback.server);
    await waitFor(() => expect(saveEnabled()).toBe(true));
    fireEvent.click(
      screen.getByRole('button', { name: messages.common.retry }),
    );
    await screen.findByText(t.saved);
    expect(bodies()).toEqual([
      { expectedVersion: 1, descriptionDoc: doc('Typed') },
      { expectedVersion: 1, descriptionDoc: doc('Typed') },
    ]);
  });
  it('429 asks to wait without a retry action', async () => {
    patch = () => problem(429, 'RATE_LIMITED');
    await typeAndSave();
    await screen.findByText(t.feedback.rateLimited);
    expect(
      screen.queryByRole('button', { name: messages.common.retry }),
    ).toBeNull();
  });
  it('a network failure keeps the input and never claims success', async () => {
    patch = () => {
      throw new TypeError('Failed to fetch');
    };
    await typeAndSave();
    await screen.findByText(t.feedback.network);
    expect(screen.queryByText(t.saved)).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });
});
