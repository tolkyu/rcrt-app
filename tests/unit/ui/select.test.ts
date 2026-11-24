// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FilterSelectField } from '@/components/ui/filter-select-field';
import { Select, type SelectOption } from '@/components/ui/select';
import messages from '../../../messages/uk.json' with { type: 'json' };

const OPTIONS: SelectOption[] = [
  { value: '', label: 'Усі' },
  { value: 'gambling', label: 'Гемблінг', description: 'Реклама' },
  { value: 'crypto', label: 'Крипто' },
  { value: 'closed', label: 'Закрита', disabled: true },
];

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
});

afterEach(cleanup);

const provider = (child: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { common: messages.common },
    children: child,
  });

interface ControlledProps {
  initial?: string;
  options?: SelectOption[];
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
}

function Controlled({
  initial = '',
  options = OPTIONS,
  onValueChange,
  ...props
}: ControlledProps) {
  const [value, setValue] = useState(initial);
  return createElement(Select, {
    id: 'field',
    value,
    options,
    onValueChange: (next: string) => {
      setValue(next);
      onValueChange?.(next);
    },
    ...props,
  });
}

const renderSelect = (props: ControlledProps = {}) =>
  render(provider(createElement(Controlled, props)));

const field = () => screen.getByRole('combobox');
const popup = () => document.querySelector('[data-slot="select-content"]');
const closed = () =>
  waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

describe('Select trigger before the chunk loads [UI foundation F3]', () => {
  it('renders a combobox button with the selected label, full text in title and no list', () => {
    renderSelect({ initial: 'gambling' });
    expect(field().tagName).toBe('BUTTON');
    expect(field().textContent).toBe('Гемблінг');
    expect(field().getAttribute('title')).toBe('Гемблінг');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('maps the empty value to the option with value "" and shows the placeholder when there is none', () => {
    const { unmount } = renderSelect({ initial: '' });
    expect(field().textContent).toBe('Усі');
    expect(field().hasAttribute('data-placeholder')).toBe(false);
    unmount();
    renderSelect({
      initial: '',
      options: OPTIONS.slice(1),
      placeholder: 'Оберіть',
    });
    expect(field().textContent).toBe('Оберіть');
    expect(field().hasAttribute('data-placeholder')).toBe(true);
  });

  it('keeps a long label on one line with the full text in title', () => {
    const long = 'Старший медіабаєр з арбітражу трафіку для нових ринків';
    renderSelect({
      initial: 'long',
      options: [{ value: 'long', label: long }],
    });
    expect(field().getAttribute('title')).toBe(long);
    expect(field().firstElementChild?.className).toContain('truncate');
  });

  it('passes aria-invalid and disabled to the trigger, and a disabled field does not open', async () => {
    renderSelect({ initial: 'crypto', disabled: true, 'aria-invalid': true });
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().hasAttribute('disabled')).toBe(true);
    await userEvent.click(field());
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('is labelled by a label that points at its id', () => {
    render(
      provider(
        createElement(FilterSelectField, {
          id: 'vertical-filter',
          label: 'Вертикаль',
          value: '',
          onChange: () => undefined,
          options: OPTIONS,
        }),
      ),
    );
    expect(screen.getByLabelText('Вертикаль').getAttribute('role')).toBe(
      'combobox',
    );
  });
  it('shows an unavailable label, never an empty field, for a value that is not among the options', () => {
    renderSelect({ initial: 'gone' });
    expect(field().textContent).toBe(messages.common.unavailable);
    expect(field().hasAttribute('data-placeholder')).toBe(true);
  });
});

describe('Select keeps naming the field after the swap [UI foundation F3]', () => {
  it('the label keeps naming the field through the swap to the Radix trigger and after Esc', async () => {
    render(
      provider(
        createElement(FilterSelectField, {
          id: 'vertical-filter',
          label: 'Вертикаль',
          value: 'crypto',
          onChange: () => undefined,
          options: OPTIONS,
        }),
      ),
    );
    await userEvent.click(screen.getByLabelText('Вертикаль'));
    await screen.findByRole('listbox');
    expect(screen.getByLabelText('Вертикаль').getAttribute('data-state')).toBe(
      'open',
    );
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(screen.getByLabelText('Вертикаль').getAttribute('role')).toBe(
      'combobox',
    );
  });

  it('onBlur fires from the static trigger and from the swapped Radix trigger', async () => {
    const onBlur = vi.fn();
    render(
      provider(
        createElement(Select, {
          value: 'crypto',
          options: OPTIONS,
          onValueChange: () => undefined,
          onBlur,
        }),
      ),
    );
    await userEvent.tab();
    await waitFor(() => expect(field().hasAttribute('data-state')).toBe(true));
    expect(document.activeElement).toBe(field());
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalled();
  });
});

describe('Select opening and value contract [UI foundation F3]', () => {
  it('opens on a mouse press after the lazy swap with an animated popup, and maps option values back', async () => {
    const onValueChange = vi.fn();
    renderSelect({ initial: 'crypto', onValueChange });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    expect(popup()?.hasAttribute('data-instant')).toBe(false);
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Усі', 'ГемблінгРеклама', 'Крипто', 'Закрита']);
    await userEvent.click(screen.getByRole('option', { name: 'Усі' }));
    expect(onValueChange).toHaveBeenLastCalledWith('');
    await closed();
    expect(field().textContent).toBe('Усі');
    await userEvent.click(field());
    await userEvent.click(
      await screen.findByRole('option', { name: 'Крипто' }),
    );
    expect(onValueChange).toHaveBeenLastCalledWith('crypto');
  });

  it('does not select a disabled option', async () => {
    const onValueChange = vi.fn();
    renderSelect({ initial: 'crypto', onValueChange });
    await userEvent.click(field());
    await userEvent.click(
      await screen.findByRole('option', { name: 'Закрита' }),
    );
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a keyboard open that triggered the chunk load is not lost and is instant', async () => {
    renderSelect({ initial: 'crypto' });
    await userEvent.tab();
    expect(document.activeElement).toBe(field());
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('listbox');
    expect(popup()?.hasAttribute('data-instant')).toBe(true);
  });

  it.each(['{ArrowDown}', ' ', '{ArrowUp}'])(
    'opens from the keyboard with %j',
    async (key) => {
      renderSelect({ initial: 'crypto' });
      await userEvent.tab();
      await userEvent.keyboard(key);
      expect(await screen.findByRole('listbox')).toBeTruthy();
    },
  );

  it('Esc closes the list and returns focus to the trigger', async () => {
    renderSelect({ initial: 'crypto' });
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(document.activeElement).toBe(field());
  });

  it('keyboard selection reports the mapped value', async () => {
    const onValueChange = vi.fn();
    renderSelect({ initial: 'crypto', onValueChange });
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Home}{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });

  it('a reopen follows the way it was opened: keyboard is instant, mouse is animated', async () => {
    renderSelect({ initial: 'crypto' });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await closed();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('listbox');
    expect(popup()?.hasAttribute('data-instant')).toBe(true);
    await userEvent.keyboard('{Escape}');
    await closed();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    expect(popup()?.hasAttribute('data-instant')).toBe(false);
  });

  it('shows a disabled row when there are no options', async () => {
    renderSelect({ initial: '', options: [], placeholder: 'Оберіть' });
    await userEvent.click(field());
    const row = await screen.findByRole('option', {
      name: messages.common.selectEmpty,
    });
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('writes the value of a named field to a hidden input', () => {
    const { container } = render(
      provider(
        createElement(Select, {
          name: 'vertical',
          value: 'crypto',
          options: OPTIONS,
          onValueChange: () => undefined,
        }),
      ),
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[name="vertical"]',
    );
    expect(input?.type).toBe('hidden');
    expect(input?.value).toBe('crypto');
  });
});
