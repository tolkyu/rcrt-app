// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Runtime from '@/components/rich-text/rich-text-editor-runtime';
import type { RichTextEditorProps } from '@/components/rich-text/rich-text-editor';
import { richTextDocSchema } from '@/lib/schemas/rich-text';
import messages from '@/messages/uk.json';

const tr = messages.richText;
const toolbarName = 'Форматування тексту: Опис';
const DESKTOP = [
  tr.bold,
  tr.italic,
  tr.heading1,
  tr.heading2,
  tr.heading3,
  tr.bulletList,
  tr.orderedList,
  tr.hardBreak,
  tr.link,
];
const PHONE = [
  tr.bold,
  tr.italic,
  tr.heading2,
  tr.bulletList,
  tr.link,
  tr.more,
];

beforeAll(() => {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

const phone = () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};
const heading = (level: number) =>
  richTextDocSchema.parse({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: 'Про роль' }],
      },
    ],
  });
const wrapped = (props: RichTextEditorProps) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { richText: messages.richText },
    children: createElement(Runtime, props),
  });
async function mounted(overrides: Partial<RichTextEditorProps> = {}) {
  const props = {
    id: 'description',
    fieldLabel: 'Опис',
    resetKey: 'one',
    initialDocument: null,
    disabled: false,
    onChange: vi.fn(),
    onReadyChange: vi.fn(),
    ...overrides,
  } satisfies RichTextEditorProps;
  const view = render(wrapped(props));
  await waitFor(() => expect(props.onReadyChange).toHaveBeenCalledWith(true));
  const root = screen.getByRole('textbox');
  const editor: unknown = Reflect.get(root, 'editor');
  if (!(editor instanceof Editor)) throw new Error('Real editor missing');
  const toolbar = screen.getByRole('toolbar', { name: toolbarName });
  const names = () =>
    within(toolbar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
  return { ...view, editor, root, toolbar, names, props };
}
const control = (toolbar: HTMLElement, name: string) =>
  within(toolbar).getByRole('button', { name });

describe('rich text toolbar [Decision 1]', () => {
  it('desktop shows all nine labelled commands in one toolbar tied to its editor', async () => {
    const { toolbar, names } = await mounted();
    expect(names()).toEqual(DESKTOP);
    expect(toolbar.getAttribute('aria-controls')).toBe('description');
    expect(control(toolbar, tr.link).getAttribute('aria-haspopup')).toBe(
      'dialog',
    );
  });

  it('has one Tab stop; arrows wrap and Home/End jump', async () => {
    const { toolbar } = await mounted();
    const stops = () =>
      within(toolbar)
        .getAllByRole('button')
        .filter((button) => button.tabIndex === 0);
    expect(stops()).toEqual([control(toolbar, tr.bold)]);
    control(toolbar, tr.bold).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(control(toolbar, tr.link));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(control(toolbar, tr.bold));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(control(toolbar, tr.link));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(control(toolbar, tr.bold));
    await waitFor(() => expect(stops()).toHaveLength(1));
  });

  it('marks the active format with the visible pressed style (B1)', async () => {
    const { toolbar, editor } = await mounted({
      initialDocument: heading(2),
    });
    act(() => {
      editor.commands.setTextSelection(2);
    });
    const button = control(toolbar, tr.heading2);
    await waitFor(() =>
      expect(button.getAttribute('aria-pressed')).toBe('true'),
    );
    expect(button.className).toContain('aria-pressed:bg-primary-subtle');
    expect(button.className).toContain('aria-pressed:text-link');
  });

  it('a locked toolbar stays focusable, runs nothing and draws no grey chips', async () => {
    const { toolbar, editor } = await mounted({ disabled: true });
    const bold = control(toolbar, tr.bold);
    expect(bold.getAttribute('aria-disabled')).toBe('true');
    expect(bold.hasAttribute('disabled')).toBe(false);
    expect(bold.className).toContain('aria-disabled:bg-transparent');
    fireEvent.click(bold);
    expect(editor.isActive('bold')).toBe(false);
  });

  it('phone shows five commands and an inline «Більше» disclosure', async () => {
    phone();
    const { toolbar, names, root } = await mounted();
    expect(names()).toEqual(PHONE);
    const more = control(toolbar, tr.more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(
      document.getElementById(more.getAttribute('aria-controls')!),
    ).not.toBeNull();
    expect(names()).toEqual([
      ...PHONE,
      tr.heading1,
      tr.heading3,
      tr.orderedList,
      tr.hardBreak,
    ]);
    expect(document.activeElement).not.toBe(root);
    control(toolbar, tr.heading1).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
    expect(names()).toEqual(PHONE);
  });

  it('phone «Більше» announces a format applied behind it', async () => {
    phone();
    const { toolbar, editor } = await mounted({ initialDocument: heading(3) });
    act(() => {
      editor.commands.setTextSelection(2);
    });
    await waitFor(() => expect(control(toolbar, tr.moreActive)).toBeTruthy());
  });

  it('phone uses six columns only when they stay 2.75rem wide, and keeps «Більше» in place (M4)', async () => {
    phone();
    const { toolbar } = await mounted();
    const classes = [...toolbar.classList];
    expect(classes).toContain('min-[20rem]:grid-cols-6');
    expect(classes).not.toContain('min-[320px]:grid-cols-6');
    expect(classes).toContain(
      'grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))]',
    );
    expect(classes).not.toContain('grid-cols-6');
    const more = control(toolbar, tr.more);
    expect([...toolbar.children].indexOf(more)).toBe(5);
    fireEvent.click(more);
    expect([...toolbar.children].indexOf(more)).toBe(5);
    expect(more.nextElementSibling?.className).toBe('contents');
  });

  it('a locked phone toolbar cannot open «Більше» (M3)', async () => {
    phone();
    const { toolbar } = await mounted({ disabled: true });
    const more = control(toolbar, tr.more);
    expect(more.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('a toolbar locked while «Більше» is open can close it once, then not reopen (M3)', async () => {
    phone();
    const { toolbar, rerender, props } = await mounted();
    const more = control(toolbar, tr.more);
    fireEvent.click(more);
    rerender(wrapped({ ...props, disabled: true }));
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['altKey', 'ctrlKey', 'metaKey'])(
    'leaves %s + arrow to the browser',
    async (modifier) => {
      const { toolbar } = await mounted();
      const bold = control(toolbar, tr.bold);
      bold.focus();
      const notPrevented = fireEvent.keyDown(bold, {
        key: 'ArrowLeft',
        [modifier]: true,
      });
      expect(notPrevented).toBe(true);
      expect(document.activeElement).toBe(bold);
    },
  );
});

describe('rich text field box', () => {
  it('uses the input border, and the error border when invalid (B3)', async () => {
    const { toolbar, rerender, props } = await mounted();
    const box = toolbar.parentElement!;
    expect(box.className).toContain('border-input');
    expect(box.className).toContain('min-h-74');
    rerender(wrapped({ ...props, 'aria-invalid': true }));
    expect(box.className).toContain('border-error');
  });

  it('offsets document headings below the page heading and keeps the tag (P9)', async () => {
    const { root } = await mounted({ initialDocument: heading(1) });
    expect(root.querySelector('h1')?.getAttribute('aria-level')).toBe('2');
  });
});
