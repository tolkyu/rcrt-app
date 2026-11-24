// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import messages from '../../../messages/uk.json' with { type: 'json' };

type Search = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly ComboboxOption[]>;

const VASYL: ComboboxOption = {
  value: 'vasyl',
  label: 'Василь Мороз',
  description: 'Гемблінг · П0',
  avatar: true,
};
const TARAS: ComboboxOption = {
  value: 'taras',
  label: 'Тарас Коваль',
  description: 'Гемблінг · П1',
  avatar: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeAll(async () => {
  Element.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  await import('@/components/ui/combobox-popup');
});

afterEach(cleanup);

interface Props {
  onSearch: Search;
  initial?: string;
  selectedOption?: ComboboxOption;
  onValueChange?: (value: string) => void;
  emptyText?: string;
}

function Controlled({
  onSearch,
  initial = '',
  onValueChange,
  ...props
}: Props) {
  const [value, setValue] = useState(initial);
  return createElement(Combobox, {
    id: 'field',
    'aria-label': 'Тімлід',
    value,
    onSearch,
    onValueChange: (next: string) => {
      setValue(next);
      onValueChange?.(next);
    },
    ...props,
  });
}

const view = (props: Props) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { common: messages.common },
    children: createElement(Controlled, props),
  });

const field = () => screen.getByRole<HTMLInputElement>('combobox');
const rows = () => screen.queryAllByRole('option');
const names = () =>
  rows().map((row) => row.querySelector('span.line-clamp-2')?.textContent);
const closed = () =>
  waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

describe('Combobox async mode [UI foundation F4]', () => {
  it('searches with an empty query on open, shows a loading row, then the results', async () => {
    const pending = deferred<readonly ComboboxOption[]>();
    const onSearch = vi.fn<Search>(() => pending.promise);
    render(view({ onSearch }));
    expect(onSearch).not.toHaveBeenCalled();
    await userEvent.click(field());
    expect((await screen.findByRole('status')).textContent).toBe(
      'Завантаження…',
    );
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(
      '',
      expect.any(AbortSignal),
    );
    await act(async () => pending.resolve([VASYL, TARAS]));
    await waitFor(() =>
      expect(names()).toEqual(['Василь Мороз', 'Тарас Коваль']),
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('false');
    expect(field().getAttribute('aria-activedescendant')).toBe(rows()[0]?.id);
  });

  it('debounces typing by 200 ms into one request and aborts the superseded one', async () => {
    const first = deferred<readonly ComboboxOption[]>();
    const second = deferred<readonly ComboboxOption[]>();
    const onSearch = vi
      .fn<Search>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(view({ onSearch }));
    await userEvent.click(field());
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(1));
    const firstSignal = onSearch.mock.calls[0]![1];
    await userEvent.keyboard('та');
    expect(onSearch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(2));
    expect(onSearch.mock.calls[1]![0]).toBe('та');
    expect(firstSignal.aborted).toBe(true);
    expect(onSearch.mock.calls[1]![1].aborted).toBe(false);
    // A late answer to the superseded query must not replace the current one.
    await act(async () => first.resolve([VASYL]));
    expect(rows()).toHaveLength(0);
    await act(async () => second.resolve([TARAS]));
    await waitFor(() => expect(names()).toEqual(['Тарас Коваль']));
  });

  it('shows the empty copy for no results, or the caller’s', async () => {
    const { unmount } = render(view({ onSearch: async () => [] }));
    await userEvent.click(field());
    expect((await screen.findByText('Нічого не знайдено')).textContent).toBe(
      'Нічого не знайдено',
    );
    unmount();
    render(
      view({
        onSearch: async () => [],
        emptyText: 'У цій вертикалі немає активних посад',
      }),
    );
    await userEvent.click(field());
    expect(
      await screen.findByText('У цій вертикалі немає активних посад'),
    ).toBeTruthy();
  });

  it('shows an error row with a retry that searches again and keeps the focus in the input', async () => {
    const onSearch = vi
      .fn<Search>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([VASYL]);
    render(view({ onSearch }));
    await userEvent.click(field());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Не вдалося завантажити список');
    await userEvent.click(
      screen.getByRole('button', { name: 'Спробувати ще раз' }),
    );
    await waitFor(() => expect(names()).toEqual(['Василь Мороз']));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(field()).toBe(document.activeElement);
  });

  it('does not search again when the caller passes a new onSearch function on every render', async () => {
    const calls = vi.fn();
    const { rerender } = render(
      view({
        onSearch: async (query) => {
          calls(query);
          return [VASYL];
        },
      }),
    );
    await userEvent.click(field());
    await waitFor(() => expect(names()).toEqual(['Василь Мороз']));
    rerender(
      view({
        onSearch: async (query) => {
          calls(query);
          return [VASYL];
        },
      }),
    );
    await act(async () => undefined);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('aborts the request when the list closes', async () => {
    const onSearch = vi.fn<Search>(() => new Promise(() => undefined));
    render(view({ onSearch }));
    await userEvent.click(field());
    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    const { signal } = { signal: onSearch.mock.calls[0]![1] };
    await userEvent.keyboard('{Escape}');
    await closed();
    await waitFor(() => expect(signal.aborted).toBe(true));
  });
});

describe('Combobox async errors and reopening [UI foundation F4]', () => {
  it('retries after onSearch threw synchronously', async () => {
    const onSearch = vi
      .fn<Search>()
      .mockImplementationOnce(() => {
        throw new Error('sync failure');
      })
      .mockResolvedValueOnce([VASYL]);
    render(view({ onSearch }));
    await userEvent.click(field());
    await screen.findByRole('alert');
    await userEvent.click(
      screen.getByRole('button', { name: 'Спробувати ще раз' }),
    );
    await waitFor(() => expect(names()).toEqual(['Василь Мороз']));
  });

  it('shows loading, not the earlier error, when reopened until the new search settles', async () => {
    const pending = deferred<readonly ComboboxOption[]>();
    const onSearch = vi
      .fn<Search>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(pending.promise);
    render(view({ onSearch }));
    await userEvent.click(field());
    await screen.findByRole('alert');
    await userEvent.keyboard('{Escape}');
    await closed();
    await userEvent.keyboard('{ArrowDown}');
    expect((await screen.findByRole('status')).textContent).toBe(
      'Завантаження…',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => pending.resolve([TARAS]));
    await waitFor(() => expect(names()).toEqual(['Тарас Коваль']));
  });

  it('does not submit the surrounding form with Enter while the list is loading', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      createElement(
        'form',
        { onSubmit },
        view({ onSearch: () => new Promise(() => undefined) }),
        createElement('button', { type: 'submit' }, 'Надіслати'),
      ),
    );
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('status');
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Combobox async selected value [UI foundation F4]', () => {
  it('keeps the label of the selected option although it is not in the current results', async () => {
    render(
      view({
        initial: 'vasyl',
        selectedOption: VASYL,
        onSearch: async () => [TARAS],
      }),
    );
    expect(field().value).toBe('Василь Мороз');
    await userEvent.click(field());
    await waitFor(() => expect(names()).toEqual(['Тарас Коваль']));
    expect(field().value).toBe('Василь Мороз');
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(field().value).toBe('Василь Мороз');
  });

  it('keeps the label of the option the user chose when later results leave it out', async () => {
    const onSearch = vi
      .fn<Search>()
      .mockResolvedValueOnce([VASYL, TARAS])
      .mockResolvedValue([]);
    render(view({ onSearch }));
    await userEvent.click(field());
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rows()[1]!);
    await closed();
    expect(field().value).toBe('Тарас Коваль');
    await userEvent.click(field());
    await userEvent.keyboard('ящщ');
    await screen.findByText('Нічого не знайдено');
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(field().value).toBe('Тарас Коваль');
  });

  it('a value nobody knows reads «Недоступно»', () => {
    render(view({ initial: 'gone', onSearch: async () => [VASYL] }));
    expect(field().value).toBe('');
    expect(field().placeholder).toBe('Недоступно');
  });
});
