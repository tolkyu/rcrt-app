// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VacancyFormContentSlot } from '@/components/vacancies/vacancy-form-content-slot';
import { vacancyFormClientMessages } from '@/lib/i18n/vacancy-form-messages';
import type { RichTextDoc } from '@/lib/schemas/rich-text';
import type {
  ContentDocs,
  FormContentHandle,
} from '@/lib/vacancy-content-form';
import messages from '@/messages/uk.json';

vi.mock('@/components/rich-text/rich-text-editor', async () => {
  const { createElement: h, Fragment } = await import('react');
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
      resetKey: string;
      onChange: (result: ReturnType<typeof parse>) => void;
    }) =>
      h(
        Fragment,
        null,
        h('div', {
          role: 'textbox',
          id: props.id,
          tabIndex: 0,
          'data-disabled': String(props.disabled),
          'data-reset': props.resetKey,
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
      ),
  };
});

const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const EMPTY: ContentDocs = { descriptionDoc: null, requirementsDoc: null };
const DESCRIPTION = 'vacancy-content-description';
const REQUIREMENTS = 'vacancy-content-requirements';
const t = messages.vacancies.contentEdit;

// Warm the lazy chunk so the first test does not race the default find timeout on a busy runner.
beforeAll(() => import('@/components/vacancies/vacancy-form-content'));
afterEach(cleanup);

async function mount(baseline: ContentDocs, disabled = false) {
  const handleRef = createRef<FormContentHandle>();
  const onDirtyChange = vi.fn<(dirty: boolean) => void>();
  const view = (next: ContentDocs, nextDisabled = disabled) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages: vacancyFormClientMessages(messages),
      children: createElement(VacancyFormContentSlot, {
        baseline: next,
        disabled: nextDisabled,
        onDirtyChange,
        handleRef,
      }),
    });
  const result = render(view(baseline));
  await screen.findByTestId(`type-${DESCRIPTION}`);
  return {
    handleRef,
    onDirtyChange,
    rerender: (next: ContentDocs, nextDisabled?: boolean) =>
      result.rerender(view(next, nextDisabled)),
  };
}

describe('«Опис і вимоги» in the create and draft forms [VAC-01, D117]', () => {
  it('shows the group with both labelled fields once the lazy part arrives', async () => {
    await mount(EMPTY);
    expect(
      screen.getByRole('heading', { name: messages.vacancyForm.content }),
    ).toBeTruthy();
    expect(screen.getByText(t.description)).toBeTruthy();
    expect(screen.getByText(t.requirements)).toBeTruthy();
  });

  it('collects nothing while untouched, then only the typed field, and reports dirtiness', async () => {
    const { handleRef, onDirtyChange } = await mount(EMPTY);
    expect(handleRef.current!.collect()).toEqual({});
    fireEvent.click(screen.getByTestId(`type-${REQUIREMENTS}`));
    expect(handleRef.current!.collect()).toEqual({
      requirementsDoc: doc('Typed'),
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('an invalid document refuses the collect, shows the field error and focuses the editor', async () => {
    const { handleRef } = await mount(EMPTY);
    fireEvent.click(screen.getByTestId(`bad-${DESCRIPTION}`));
    expect(screen.getByText(t.errors.invalid_link)).toBeTruthy();
    let collected: ReturnType<FormContentHandle['collect']> | undefined;
    act(() => {
      collected = handleRef.current!.collect();
    });
    expect(collected).toBeNull();
    expect(document.activeElement?.id).toBe(DESCRIPTION);
  });

  it('clearing a stored document collects null; undo restores the unchanged state', async () => {
    const { handleRef } = await mount({
      ...EMPTY,
      descriptionDoc: doc('Опис'),
    });
    const [clearDescription] = screen.getAllByRole('button', { name: t.clear });
    fireEvent.click(clearDescription!);
    expect(screen.getByText(t.cleared)).toBeTruthy();
    expect(handleRef.current!.collect()).toEqual({ descriptionDoc: null });
    fireEvent.click(screen.getByRole('button', { name: t.undoClear }));
    expect(handleRef.current!.collect()).toEqual({});
  });

  it('a baseline holding the typed document (the save that stored it) is clean and keeps the editor', async () => {
    const { handleRef, onDirtyChange, rerender } = await mount(EMPTY);
    fireEvent.click(screen.getByTestId(`type-${DESCRIPTION}`));
    const editor = document.getElementById(DESCRIPTION)!;
    const resetBefore = editor.dataset.reset;
    rerender({ ...EMPTY, descriptionDoc: doc('Typed') });
    expect(handleRef.current!.collect()).toEqual({});
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(document.getElementById(DESCRIPTION)!.dataset.reset).toBe(
      resetBefore,
    );
  });

  it('a reloaded baseline that differs restarts that editor from it', async () => {
    const { rerender } = await mount(EMPTY);
    fireEvent.click(screen.getByTestId(`type-${DESCRIPTION}`));
    rerender({ ...EMPTY, descriptionDoc: doc('Інший') });
    expect(document.getElementById(DESCRIPTION)!.dataset.reset).toBe('1');
    expect(document.getElementById(REQUIREMENTS)!.dataset.reset).toBe('0');
  });

  it('locks both editors while the form sends', async () => {
    const { rerender } = await mount(EMPTY);
    rerender(EMPTY, true);
    for (const id of [DESCRIPTION, REQUIREMENTS])
      expect(document.getElementById(id)!.dataset.disabled).toBe('true');
  });
});
