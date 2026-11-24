// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import type * as ReactModule from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/uk.json';

const chunk = vi.hoisted(() => ({ fail: false, attempts: 0 }));
vi.mock('react', async (original) => {
  const actual = await original<typeof ReactModule>();
  const lazy: typeof actual.lazy = (load) =>
    actual.lazy(() => {
      chunk.attempts++;
      return chunk.fail ? Promise.reject(new Error('ChunkLoadError')) : load();
    });
  return { ...actual, lazy };
});
vi.mock('@/components/rich-text/rich-text-editor-runtime', () => {
  return {
    default: () =>
      createElement('div', { 'data-testid': 'editor-runtime' }, 'runtime'),
  };
});
beforeEach(() => {
  chunk.fail = false;
  chunk.attempts = 0;
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const props = () => ({
  id: 'description',
  fieldLabel: 'Опис',
  initialDocument: null,
  resetKey: 'one',
  disabled: false,
  onChange: vi.fn(),
  onReadyChange: vi.fn(),
});
const wrap = (children: ReactNode) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { richText: messages.richText },
    children,
  });

describe('rich text lazy shell', () => {
  it('never imports the editor during SSR and reserves the same loading geometry', async () => {
    const { RichTextEditor } =
      await import('@/components/rich-text/rich-text-editor');
    const input = props();
    const html = renderToStaticMarkup(
      wrap(createElement(RichTextEditor, input)),
    );
    expect(html).toContain(messages.richText.loading);
    expect(html).toContain('min-h-74 md:min-h-94');
    expect(chunk.attempts).toBe(0);
    expect(input.onChange).not.toHaveBeenCalled();
  });

  it('reports not-ready while loading and on unmount without emitting an edit', async () => {
    const { RichTextEditor } =
      await import('@/components/rich-text/rich-text-editor');
    const input = props();
    const view = render(wrap(createElement(RichTextEditor, input)));
    expect(input.onReadyChange).toHaveBeenCalledWith(false);
    await screen.findByTestId('editor-runtime');
    expect(input.onChange).not.toHaveBeenCalled();
    view.unmount();
    expect(input.onReadyChange).toHaveBeenLastCalledWith(false);
  });

  it('recovers a rejected lazy import using a fresh import and boundary on retry', async () => {
    chunk.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { RichTextEditor } =
      await import('@/components/rich-text/rich-text-editor');
    const input = props();
    render(wrap(createElement(RichTextEditor, input)));
    await screen.findByRole('alert');
    expect(input.onReadyChange).toHaveBeenLastCalledWith(false);
    expect(input.onChange).not.toHaveBeenCalled();
    const attempts = chunk.attempts;
    chunk.fail = false;
    fireEvent.click(
      screen.getByRole('button', { name: messages.richText.retry }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('editor-runtime')).toBeTruthy(),
    );
    expect(chunk.attempts).toBeGreaterThan(attempts);
  });

  it('reports a chunk failure until a retry has really loaded the runtime', async () => {
    chunk.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { RichTextEditor } =
      await import('@/components/rich-text/rich-text-editor');
    const onLoadFailedChange = vi.fn();
    render(
      wrap(createElement(RichTextEditor, { ...props(), onLoadFailedChange })),
    );
    await screen.findByRole('alert');
    expect(onLoadFailedChange).toHaveBeenLastCalledWith(true);
    onLoadFailedChange.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: messages.richText.retry }),
    );
    await screen.findByRole('alert');
    expect(onLoadFailedChange).not.toHaveBeenCalledWith(false);
    chunk.fail = false;
    fireEvent.click(
      screen.getByRole('button', { name: messages.richText.retry }),
    );
    await screen.findByTestId('editor-runtime');
    await waitFor(() =>
      expect(onLoadFailedChange).toHaveBeenLastCalledWith(false),
    );
  });
});
