// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/core';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Runtime from '@/components/rich-text/rich-text-editor-runtime';
import type {
  RichTextEditorHandle,
  RichTextEditorProps,
} from '@/components/rich-text/rich-text-editor';
import { richTextDocSchema, type RichTextDoc } from '@/lib/schemas/rich-text';
import messages from '@/messages/uk.json';

beforeAll(() => {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(cleanup);
const doc = (text: string) =>
  richTextDocSchema.parse({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
const defaults = () =>
  ({
    id: 'description',
    resetKey: 'one',
    initialDocument: null,
    disabled: false,
    onChange: vi.fn(),
    onReadyChange: vi.fn(),
    'aria-labelledby': 'description-label',
    'aria-describedby': 'description-hint',
  }) satisfies RichTextEditorProps;
const wrapped = (props: RichTextEditorProps) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { richText: messages.richText },
    children: createElement(Runtime, props),
  });
async function mounted(props: RichTextEditorProps = defaults()) {
  const view = render(wrapped(props));
  await waitFor(() => expect(props.onReadyChange).toHaveBeenCalledWith(true));
  const root = screen.getByRole('textbox');
  const editor: unknown = Reflect.get(root, 'editor');
  if (!(editor instanceof Editor))
    throw new Error('Real Tiptap editor missing');
  return { ...view, editor, root, props };
}

describe('real rich text runtime', () => {
  it('keeps readiness false if an explicit adoption cannot produce a valid current document', async () => {
    const props = defaults();
    const { editor, rerender } = await mounted(props);
    act(() => {
      editor.commands.insertContent('x'.repeat(50_001));
    });
    const invalidBaseline = doc('Invalid baseline');
    invalidBaseline.content.push(
      ...Array.from(
        { length: 201 },
        () => ({ type: 'paragraph' }) satisfies RichTextDoc['content'][number],
      ),
    );
    props.onReadyChange.mockClear();
    rerender(
      wrapped({
        ...props,
        initialDocument: invalidBaseline,
        resetKey: 'invalid-adoption',
      }),
    );
    expect(props.onReadyChange.mock.calls).toEqual([[false], [false]]);
    expect(editor.getText()).toHaveLength(50_001);
  });
  it.each([null, doc('Adopted baseline')])(
    'reports readiness again after adopting an explicit baseline without remounting (%j)',
    async (initialDocument) => {
      const props = {
        ...defaults(),
        initialDocument: doc('Previous baseline'),
      };
      const { editor, root, rerender } = await mounted(props);
      props.onReadyChange.mockClear();
      rerender(
        wrapped({ ...props, initialDocument, resetKey: 'explicit-adoption' }),
      );
      expect(props.onReadyChange.mock.calls).toEqual([[false], [true]]);
      expect(Reflect.get(root, 'editor')).toBe(editor);
      expect(props.onChange).not.toHaveBeenCalled();
      expect(editor.getText()).toBe(
        initialDocument === null ? '' : 'Adopted baseline',
      );
      props.onReadyChange.mockClear();
      rerender(
        wrapped({ ...props, initialDocument, resetKey: 'explicit-adoption' }),
      );
      expect(props.onReadyChange).not.toHaveBeenCalled();
      expect(Reflect.get(root, 'editor')).toBe(editor);
    },
  );

  it('undoes and redoes typed input while retaining history across ordinary renders and canonical saves', async () => {
    const { editor, root, props, rerender } = await mounted();
    act(() => root.focus());
    await userEvent.type(root, 'abc', { skipClick: true });
    await waitFor(() => expect(editor.getText()).toBe('abc'));
    const saved = richTextDocSchema.parse(editor.getJSON());
    const selection = editor.state.selection.to;
    rerender(wrapped({ ...props, initialDocument: doc('Background read') }));
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
    });
    expect(editor.getText()).toBe('');
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(editor.getText()).toBe('abc');
    rerender(wrapped({ ...props, initialDocument: saved }));
    expect(editor.state.selection.to).toBe(selection);
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
    });
    expect(editor.getText()).toBe('');
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(editor.getText()).toBe('abc');
  });

  it('discards undo history when an explicit reload replaces the baseline', async () => {
    const { editor, root, props, rerender } = await mounted();
    act(() => root.focus());
    await userEvent.type(root, 'Discarded buffer', { skipClick: true });
    await waitFor(() => expect(editor.getText()).toBe('Discarded buffer'));
    rerender(
      wrapped({
        ...props,
        initialDocument: doc('Fresh baseline'),
        resetKey: 'explicit-reload',
      }),
    );
    expect(editor.getText()).toBe('Fresh baseline');
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
    });
    expect(editor.getText()).toBe('Fresh baseline');
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(editor.getText()).toBe('Fresh baseline');
    await userEvent.type(root, ' new', { skipClick: true });
    await waitFor(() => expect(editor.getText()).toContain(' new'));
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
    });
    expect(editor.getText()).toBe('Fresh baseline');
  });

  it('drops prior history on an equal-content explicit adoption without resetting the editor, document, selection or stored marks', async () => {
    const props = defaults();
    const { editor, root, rerender } = await mounted(props);
    act(() => root.focus());
    await userEvent.type(root, 'abc', { skipClick: true });
    await waitFor(() => expect(editor.getText()).toBe('abc'));
    act(() => {
      editor.commands.setTextSelection(2);
      editor.commands.toggleBold();
    });
    const { doc: priorDoc, selection, storedMarks } = editor.state;
    const changeCount = props.onChange.mock.calls.length;
    const current = richTextDocSchema.parse(editor.getJSON());
    rerender(
      wrapped({
        ...props,
        initialDocument: current,
        resetKey: 'explicit-adoption',
      }),
    );
    expect(Reflect.get(root, 'editor')).toBe(editor);
    expect(editor.state.doc).toBe(priorDoc);
    expect(editor.state.selection).toBe(selection);
    expect(editor.state.storedMarks).toBe(storedMarks);
    expect(props.onChange).toHaveBeenCalledTimes(changeCount);
    fireEvent.keyDown(root, {
      key: 'z',
      code: 'KeyZ',
      keyCode: 90,
      ctrlKey: true,
    });
    expect(editor.getText()).toBe('abc');
    expect(props.onChange).toHaveBeenCalledTimes(changeCount);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    'leaves save shortcuts to the parent and reserves Shift+Enter for line breaks (%j)',
    async (modifier) => {
      const props = { ...defaults(), initialDocument: doc('Досвід') };
      const save = vi.fn();
      render(
        createElement(
          'form',
          {
            onKeyDown: (event) => {
              if (
                event.key === 'Enter' &&
                (event.ctrlKey || event.metaKey) &&
                !event.nativeEvent.isComposing &&
                !event.defaultPrevented
              ) {
                save();
                event.preventDefault();
              }
            },
          },
          wrapped(props),
        ),
      );
      await waitFor(() =>
        expect(props.onReadyChange).toHaveBeenCalledWith(true),
      );
      const root = screen.getByRole('textbox');
      const editor: unknown = Reflect.get(root, 'editor');
      if (!(editor instanceof Editor))
        throw new Error('Real Tiptap editor missing');
      const initial = editor.getJSON();
      fireEvent.keyDown(root, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        ...modifier,
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(editor.getJSON()).toEqual(initial);
      expect(props.onChange).not.toHaveBeenCalled();
      fireEvent.keyDown(root, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        shiftKey: true,
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(root.querySelector('br')).not.toBeNull();
      expect(props.onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'valid' }),
      );
      expect(editor.getJSON()).not.toEqual(initial);
      expect(editor.getJSON().content?.[0]?.content).toContainEqual({
        type: 'hardBreak',
      });
      fireEvent.click(
        screen.getByRole('button', { name: messages.richText.hardBreak }),
      );
      expect(
        editor
          .getJSON()
          .content?.[0]?.content?.filter((node) => node.type === 'hardBreak'),
      ).toHaveLength(2);
      expect(save).toHaveBeenCalledTimes(1);
      const beforeComposition = editor.getJSON();
      fireEvent.compositionStart(root);
      fireEvent.keyDown(root, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        isComposing: true,
        ...modifier,
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(editor.getJSON()).toEqual(beforeComposition);
      fireEvent.compositionEnd(root);
    },
  );

  it('initializes NULL without a user edit and forwards field ARIA/focus/readiness', async () => {
    const props = defaults();
    const ref = createRef<RichTextEditorHandle>();
    const view = await mounted({ ...props, ref, 'aria-invalid': true });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(view.root.id).toBe('description');
    expect(view.root.getAttribute('aria-labelledby')).toBe('description-label');
    expect(view.root.getAttribute('aria-describedby')).toBe('description-hint');
    expect(view.root.getAttribute('aria-invalid')).toBe('true');
    expect(view.root.getAttribute('aria-multiline')).toBe('true');
    act(() => ref.current?.focus());
    await waitFor(() => expect(document.activeElement).toBe(view.root));
    view.unmount();
    expect(props.onReadyChange).toHaveBeenLastCalledWith(false);
  });

  it('emits invalid input, keeps it displayed, and recovers without a previous-valid fallback', async () => {
    const { editor, props, root, rerender } = await mounted();
    act(() => {
      editor.commands.insertContent('x'.repeat(50_001));
    });
    expect(props.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'invalid' }),
    );
    expect(root.textContent).toHaveLength(50_001);
    rerender(wrapped({ ...props, onChange: props.onChange }));
    expect(root.textContent).toHaveLength(50_001);
    act(() => {
      editor.commands.setContent(doc('Виправлено'));
    });
    expect(props.onChange).toHaveBeenLastCalledWith({
      kind: 'valid',
      document: doc('Виправлено'),
    });
    act(() => {
      editor.commands.clearContent();
    });
    expect(props.onChange).toHaveBeenLastCalledWith({
      kind: 'valid',
      document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
  });

  it('retains the same editor and selection for ordinary rerenders and canonical-equivalent resets', async () => {
    const props = { ...defaults(), initialDocument: doc('Досвід роботи') };
    const { editor, rerender } = await mounted(props);
    act(() => {
      editor.commands.setTextSelection({ from: 2, to: 5 });
      editor.commands.toggleBold();
    });
    const current = richTextDocSchema.parse(editor.getJSON());
    const nextChange = vi.fn();
    rerender(
      wrapped({
        ...props,
        initialDocument: doc('Ignored background document'),
        onChange: nextChange,
      }),
    );
    expect(editor.getText()).toBe('Досвід роботи');
    expect(editor.state.selection.from).toBe(2);
    rerender(
      wrapped({
        ...props,
        'aria-describedby': 'new-error',
        'aria-invalid': true,
      }),
    );
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toBe(
      'new-error',
    );
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(editor.state.selection.from).toBe(2);
    rerender(
      wrapped({
        ...props,
        initialDocument: current,
        resetKey: 'adopted',
        onChange: nextChange,
      }),
    );
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.to).toBe(5);
    act(() => {
      editor.commands.insertContent('Новий');
    });
    expect(nextChange).toHaveBeenCalled();
    rerender(
      wrapped({
        ...props,
        initialDocument: doc('Оновлено'),
        resetKey: 'reload',
      }),
    );
    expect(editor.getText()).toBe('Оновлено');
    expect(Reflect.get(screen.getByRole('textbox'), 'editor')).toBe(editor);
  });

  it('normalizes mark rank and extension defaults before a reset comparison', async () => {
    const initial = richTextDocSchema.parse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Досвід',
              marks: [
                { type: 'bold' },
                { type: 'link', attrs: { href: 'https://example.com/' } },
                { type: 'italic' },
              ],
            },
          ],
        },
      ],
    });
    const props = { ...defaults(), initialDocument: initial };
    const { editor, rerender } = await mounted(props);
    act(() => {
      editor.commands.setTextSelection({ from: 2, to: 4 });
    });
    const transaction = vi.fn();
    editor.on('transaction', transaction);
    rerender(wrapped({ ...props, resetKey: 'canonical-adoption' }));
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.to).toBe(4);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps formatting keyboard-operable, suppresses composing toolbar actions, and updates disabled state', async () => {
    const { editor, props, rerender, root } = await mounted();
    const bold = screen.getByRole('button', { name: messages.richText.bold });
    expect(bold.getAttribute('type')).toBe('button');
    fireEvent.keyDown(root, {
      key: 'i',
      code: 'KeyI',
      keyCode: 73,
      ctrlKey: true,
    });
    expect(editor.isActive('italic')).toBe(true);
    fireEvent.compositionStart(root);
    fireEvent.click(bold);
    expect(editor.isActive('bold')).toBe(false);
    fireEvent.compositionEnd(root);
    await waitFor(() => expect(editor.view.composing).toBe(false));
    fireEvent.click(bold);
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    rerender(wrapped({ ...props, disabled: true }));
    expect(root.getAttribute('contenteditable')).toBe('false');
    expect(
      screen
        .getAllByRole('button')
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true);
  });

  it('allows only paragraph list items/headings 1–3 and strips unsupported pasted markup', async () => {
    const { editor, root } = await mounted();
    expect(editor.schema.nodes.listItem?.spec.content).toBe('paragraph{1,20}');
    act(() => {
      editor.commands.insertContent(
        '<h4>Текст</h4><p><s>Зайве</s><img src="https://example.com/image"><script>alert(1)</script></p>',
      );
    });
    expect(root.querySelector('h4,img,script,s')).toBeNull();
    expect(editor.getText()).toContain('Текст');
    expect(editor.getText()).toContain('Зайве');
    fireEvent.paste(root, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/html'
            ? '<p><a href="javascript:alert(1)">Небезпечне</a><a href="https://safe.example/">Безпечне</a><iframe src="https://example.com/"></iframe></p>'
            : '',
        files: [],
        types: ['text/html'],
      },
    });
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(
      root.querySelector('a[href="https://safe.example/"]'),
    ).not.toBeNull();
  });

  it('validates a link with shared rules, restores selection/focus, and contains Enter shortcuts inside its dialog', async () => {
    const props = { ...defaults(), initialDocument: doc('Досвід роботи') };
    const bubbled = vi.fn();
    const view = render(
      createElement('div', { onKeyDown: bubbled }, wrapped(props)),
    );
    await waitFor(() => expect(props.onReadyChange).toHaveBeenCalledWith(true));
    const editor: unknown = Reflect.get(screen.getByRole('textbox'), 'editor');
    if (!(editor instanceof Editor)) throw new Error('Real editor missing');
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireEvent.click(
      screen.getByRole('button', { name: messages.richText.link }),
    );
    const input = await screen.findByLabelText(messages.richText.linkAddress);
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe(
      messages.richText.invalidLink,
    );
    expect(bubbled).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'https://example.com/' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(bubbled).not.toHaveBeenCalled();
    screen.getByRole('button', { name: messages.richText.applyLink }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(editor.getAttributes('link').href).toBe('https://example.com/');
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(7);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox')),
    );
    const anchor = screen.getByRole('link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: messages.richText.link }),
    );
    fireEvent.change(
      await screen.findByLabelText(messages.richText.linkAddress),
      { target: { value: 'https://not-applied.example/' } },
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(editor.getAttributes('link').href).toBe('https://example.com/');
    fireEvent.click(
      screen.getByRole('button', { name: messages.richText.link }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: messages.richText.removeLink }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(editor.isActive('link')).toBe(false);
    view.unmount();
  });
});
