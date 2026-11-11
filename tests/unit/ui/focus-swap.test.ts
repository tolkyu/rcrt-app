// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, createRef, Fragment, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import {
  useFocusHold,
  useRestoreFocus,
} from '@/components/ui/use-restore-focus';
import messages from '../../../messages/uk.json' with { type: 'json' };

beforeAll(async () => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  await import('@/components/ui/select-content');
  await import('@/components/ui/tooltip-content');
});

afterEach(cleanup);

const user = userEvent.setup({ delay: null });

function Swappable({ id, swapped }: { id: string; swapped: boolean }) {
  const { held, track } = useFocusHold();
  const attach = useRestoreFocus(true, held);
  return swapped
    ? createElement('input', { id, ref: attach })
    : createElement('button', { id, type: 'button', ref: track });
}

function Pair({ initial }: { initial: boolean }) {
  const [swapped, setSwapped] = useState(initial);
  return createElement(
    Fragment,
    null,
    createElement('button', {
      type: 'button',
      'data-testid': 'swap',
      onClick: () => setSwapped(true),
    }),
    createElement(Swappable, { id: 'one', swapped }),
    createElement(Swappable, { id: 'two', swapped }),
    createElement('a', { id: 'next', href: '#next' }, 'Далі'),
  );
}

describe('replacing a focused trigger [UI foundation F3, WCAG 2.1.1]', () => {
  it('two triggers replaced in one commit: focus stays on the one that held it, not the first replacement', () => {
    render(createElement(Pair, { initial: false }));
    act(() => document.getElementById('two')?.focus());
    act(() => screen.getByTestId('swap').click());
    expect(document.activeElement).toBe(document.getElementById('two'));
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('a replaced trigger that held focus gets it back', () => {
    render(createElement(Pair, { initial: false }));
    act(() => document.getElementById('one')?.focus());
    act(() => screen.getByTestId('swap').click());
    expect(document.activeElement).toBe(document.getElementById('one'));
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('focus that moved on before the commit is left where the user put it', () => {
    render(createElement(Pair, { initial: false }));
    act(() => document.getElementById('one')?.focus());
    act(() => document.getElementById('next')?.focus());
    act(() => screen.getByTestId('swap').click());
    expect(document.activeElement).toBe(document.getElementById('next'));
  });
});

const options = [
  { value: 'a', label: 'Альфа' },
  { value: 'b', label: 'Бета' },
];
const field = (
  id: string,
  label: string,
  onValueChange: (value: string) => void = () => undefined,
) =>
  createElement(Select, {
    id,
    value: 'a',
    options,
    onValueChange,
    'aria-label': label,
  });

const renderRow = (...children: ReturnType<typeof createElement>[]) =>
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      messages: { common: messages.common },
      children: createElement(Fragment, null, ...children),
    }),
  );

describe('lazy Select and Tooltip keep keyboard focus through the swap', () => {
  it('a Tab pressed while the swap is pending lands on the next control', async () => {
    renderRow(
      field('one', 'Перше'),
      createElement('button', { type: 'button' }, 'Далі'),
    );
    await act(async () => {
      await user.tab();
      await user.tab();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Перше').dataset.state).toBe('closed'),
    );
    expect(document.activeElement).toBe(screen.getByText('Далі'));
  });

  it('a swapped field that held focus keeps it and answers type-ahead', async () => {
    const onValueChange = vi.fn();
    renderRow(field('one', 'Перше', onValueChange));
    await user.tab();
    await waitFor(() =>
      expect(screen.getByLabelText('Перше').dataset.state).toBe('closed'),
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Перше'));
    await user.keyboard('Б');
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('a tooltip trigger keeps the ref its owner passed and its focus after the swap', async () => {
    const own = createRef<HTMLElement>();
    renderRow(
      createElement(Tooltip, {
        content: 'Підказка',
        children: createElement('button', { type: 'button', ref: own }, 'Дія'),
      }),
    );
    expect(own.current).toBe(screen.getByText('Дія'));
    await user.tab();
    await waitFor(() =>
      expect(screen.getByText('Дія').dataset.state).toBeDefined(),
    );
    expect(own.current).toBe(screen.getByText('Дія'));
    expect(document.activeElement).toBe(screen.getByText('Дія'));
  });
});
