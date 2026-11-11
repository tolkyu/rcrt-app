// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import messages from '../../../messages/uk.json' with { type: 'json' };

const PEOPLE: ComboboxOption[] = [
  {
    value: 'v1',
    label: 'Василь Мороз',
    description: 'Гемблінг · П0',
    avatar: true,
  },
  {
    value: 'v2',
    label: 'Василь Мороз',
    description: 'Крипто · П1',
    avatar: true,
  },
  {
    value: 'o',
    label: 'Олена Дем’янчук',
    description: 'Гемблінг · П1',
    avatar: true,
  },
  {
    value: 'x',
    label: 'Ярослав Ґрунтовий',
    description: 'Крипто',
    avatar: true,
    inactive: true,
    disabled: true,
  },
  { value: 'z', label: 'Зоя Петренко', description: 'Гемблінг' },
];

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

const provider = (child: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { common: messages.common, form: messages.form },
    children: child,
  });

interface ControlledProps {
  initial?: string;
  options?: ComboboxOption[];
  onValueChange?: (value: string) => void;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onBlur?: () => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

function Controlled({
  initial = '',
  options = PEOPLE,
  onValueChange,
  ...props
}: ControlledProps) {
  const [value, setValue] = useState(initial);
  return createElement(Combobox, {
    id: 'field',
    'aria-label': 'Тімлід',
    value,
    options,
    onValueChange: (next: string) => {
      setValue(next);
      onValueChange?.(next);
    },
    ...props,
  });
}

const renderCombobox = (props: ControlledProps = {}) =>
  render(provider(createElement(Controlled, props)));

const field = () => screen.getByRole<HTMLInputElement>('combobox');
const popup = () => document.querySelector('[data-slot="combobox-content"]');
const rows = () => screen.queryAllByRole('option');
const labels = () =>
  rows().map(
    (row) =>
      row.querySelector('span.line-clamp-2')?.textContent ?? row.textContent,
  );
const closed = () =>
  waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
const activeRow = () =>
  document.getElementById(field().getAttribute('aria-activedescendant') ?? '');

describe('Combobox closed field [UI foundation F4]', () => {
  it('is an editable combobox input showing the selected label, with the full text in title and no list', () => {
    renderCombobox({ initial: 'o' });
    expect(field().tagName).toBe('INPUT');
    expect(field().value).toBe('Олена Дем’янчук');
    expect(field().title).toBe('Олена Дем’янчук');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(field().getAttribute('aria-autocomplete')).toBe('list');
    expect(field().hasAttribute('aria-controls')).toBe(false);
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows the placeholder when nothing is selected', () => {
    renderCombobox({ placeholder: 'Оберіть тімліда' });
    expect(field().value).toBe('');
    expect(field().placeholder).toBe('Оберіть тімліда');
  });

  it('a value that is not among the options reads «Недоступно», never a blank field', () => {
    renderCombobox({ initial: 'gone', placeholder: 'Оберіть тімліда' });
    expect(field().value).toBe('');
    expect(field().placeholder).toBe('Недоступно');
  });

  it('forwards aria-invalid and aria-describedby, and is named by a FormField label', async () => {
    render(
      provider(
        createElement(FormField, {
          id: 'team-lead',
          label: 'Тімлід',
          error: 'Оберіть тімліда',
          children: (control) =>
            createElement(Combobox, {
              ...control,
              value: '',
              options: PEOPLE,
              onValueChange: () => undefined,
            }),
        }),
      ),
    );
    expect(field().id).toBe('team-lead');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toBe('team-lead-error');
    expect(screen.getByLabelText('Тімлід')).toBe(field());
    await userEvent.click(field());
    expect(
      (await screen.findByRole('listbox')).getAttribute('aria-label'),
    ).toBe('Тімлід');
  });

  it('names the list after the label without the required mark', async () => {
    render(
      provider(
        createElement(FormField, {
          id: 'team-lead',
          label: 'Тімлід',
          required: true,
          children: (control) =>
            createElement(Combobox, {
              ...control,
              value: '',
              options: PEOPLE,
              onValueChange: () => undefined,
            }),
        }),
      ),
    );
    await userEvent.click(field());
    expect(
      (await screen.findByRole('listbox')).getAttribute('aria-label'),
    ).toBe('Тімлід');
  });

  it('submits the value under `name` through a hidden input', () => {
    const { container } = render(
      provider(
        createElement(Combobox, {
          name: 'teamLead',
          value: 'z',
          options: PEOPLE,
          onValueChange: () => undefined,
        }),
      ),
    );
    expect(
      container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value,
    ).toBe('z');
  });
});

describe('Combobox open list [UI foundation F4]', () => {
  it('a click opens the list wired by aria, starts on the selected option and animates', async () => {
    renderCombobox({ initial: 'o' });
    await userEvent.click(field());
    const list = await screen.findByRole('listbox');
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(field().getAttribute('aria-controls')).toBe(list.id);
    expect(rows()).toHaveLength(5);
    expect(activeRow()).toBe(rows()[2]);
    expect(rows()[2]?.getAttribute('aria-selected')).toBe('true');
    expect(rows()[0]?.getAttribute('aria-selected')).toBe('false');
    expect(popup()?.hasAttribute('data-instant')).toBe(false);
    expect(field()).toBe(document.activeElement);
  });

  it('opened from the keyboard it has no animation', async () => {
    renderCombobox();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    expect(popup()?.hasAttribute('data-instant')).toBe(true);
    expect(activeRow()).toBe(rows()[0]);
  });

  it('shows avatar, secondary line and «неактивний»; a disabled option is announced as such', async () => {
    renderCombobox();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    const inactive = rows()[3]!;
    expect(inactive.textContent).toContain('Ярослав Ґрунтовий');
    expect(inactive.textContent).toContain('неактивний');
    expect(inactive.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(inactive.getAttribute('aria-disabled')).toBe('true');
    expect(rows()[4]?.querySelector('[data-slot="avatar"]')).toBeNull();
  });

  it('two people with the same name are told apart by the secondary line', async () => {
    renderCombobox();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    expect(rows()[0]?.textContent).toContain('Гемблінг · П0');
    expect(rows()[1]?.textContent).toContain('Крипто · П1');
    await userEvent.keyboard('мороз крипто');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain('Крипто · П1');
  });

  it('marks the current value for assistive technology', async () => {
    renderCombobox({ initial: 'z' });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    expect(rows()[4]?.textContent).toContain('вибрано');
    expect(rows()[0]?.textContent).not.toContain('вибрано');
  });
});

describe('Combobox local filtering [UI foundation F4]', () => {
  it('filters as you type, ignoring case, and the first keystroke replaces the selected label', async () => {
    renderCombobox({ initial: 'z' });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.keyboard('ОЛЕ');
    expect(field().value).toBe('ОЛЕ');
    expect(labels()).toEqual(['Олена Дем’янчук']);
    expect(activeRow()).toBe(rows()[0]);
  });

  it('matches every apostrophe variant and the secondary line', async () => {
    renderCombobox();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.keyboard("дем'ян");
    expect(labels()).toEqual(['Олена Дем’янчук']);
    await userEvent.clear(field());
    await userEvent.keyboard('П1');
    expect(labels()).toEqual(['Василь Мороз', 'Олена Дем’янчук']);
  });

  it('typing opens the list from a closed field without animation', async () => {
    renderCombobox();
    await userEvent.tab();
    await userEvent.keyboard('зо');
    await screen.findByRole('listbox');
    expect(popup()?.hasAttribute('data-instant')).toBe(true);
    expect(labels()).toEqual(['Зоя Петренко']);
  });

  it('shows the default empty copy, or the caller’s', async () => {
    const { unmount } = renderCombobox();
    await userEvent.click(field());
    await userEvent.keyboard('ящщщ');
    expect((await screen.findByRole('status')).textContent).toBe(
      'Нічого не знайдено',
    );
    expect(rows()).toHaveLength(0);
    unmount();
    renderCombobox({ emptyText: 'У цій вертикалі немає активних посад' });
    await userEvent.click(field());
    await userEvent.keyboard('ящщщ');
    expect((await screen.findByRole('status')).textContent).toBe(
      'У цій вертикалі немає активних посад',
    );
  });

  it('handles 200 options', async () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      value: `p${index}`,
      label: `Посада ${index}`,
    }));
    renderCombobox({ options: many });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    expect(rows()).toHaveLength(200);
    await userEvent.keyboard('Посада 199');
    expect(labels()).toEqual(['Посада 199']);
  });
});

describe('Combobox keyboard [UI foundation F4]', () => {
  it('arrows move the active option and skip disabled ones; the ends do not wrap', async () => {
    renderCombobox();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    expect(activeRow()).toBe(rows()[0]);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeRow()).toBe(rows()[2]);
    await userEvent.keyboard('{ArrowDown}');
    expect(activeRow()).toBe(rows()[4]);
    await userEvent.keyboard('{ArrowDown}');
    expect(activeRow()).toBe(rows()[4]);
    await userEvent.keyboard('{ArrowUp}');
    expect(activeRow()).toBe(rows()[2]);
    expect(rows()[2]?.getAttribute('aria-selected')).toBe('true');
    expect(field()).toBe(document.activeElement);
  });

  it('Home and End are left to the caret of the input', async () => {
    renderCombobox();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await screen.findByRole('listbox');
    const before = activeRow();
    const home = fireEvent.keyDown(field(), { key: 'Home' });
    const end = fireEvent.keyDown(field(), { key: 'End' });
    expect(home && end).toBe(true);
    expect(activeRow()).toBe(before);
  });

  it('a key that belongs to an IME composition neither selects nor is swallowed', async () => {
    const onValueChange = vi.fn();
    renderCombobox({ onValueChange });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    const composing = fireEvent.keyDown(field(), {
      key: 'Enter',
      isComposing: true,
    });
    const safari = fireEvent.keyDown(field(), { key: 'Enter', keyCode: 229 });
    expect(composing && safari).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('with every option disabled the arrows and Enter do nothing and do not throw', async () => {
    const onValueChange = vi.fn();
    renderCombobox({
      onValueChange,
      options: PEOPLE.map((option) => ({ ...option, disabled: true })),
    });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('Enter on a list with no matches does not submit the form', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      provider(
        createElement(
          'form',
          { onSubmit },
          createElement(Controlled),
          createElement('button', { type: 'submit' }, 'Надіслати'),
        ),
      ),
    );
    await userEvent.tab();
    await userEvent.keyboard('ящщщ');
    await screen.findByRole('status');
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('forwards onBlur when focus leaves the field', async () => {
    const onBlur = vi.fn();
    renderCombobox({ onBlur });
    await userEvent.tab();
    expect(onBlur).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('closes the list when the field becomes disabled', async () => {
    const { rerender } = renderCombobox();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    rerender(provider(createElement(Controlled, { disabled: true })));
    await closed();
    expect(field().getAttribute('aria-expanded')).toBe('false');
  });

  it('scrolls the active option into view for keyboard moves but not for hovering', async () => {
    renderCombobox();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      await userEvent.hover(rows()[2]!);
      expect(activeRow()).toBe(rows()[2]);
      expect(scroll).not.toHaveBeenCalled();
      await userEvent.keyboard('{ArrowDown}');
      expect(scroll).toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = () => undefined;
    }
  });

  it('Enter chooses the active option, closes the list and keeps focus in the input', async () => {
    const onValueChange = vi.fn();
    renderCombobox({ onValueChange });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('v2');
    await closed();
    expect(field().value).toBe('Василь Мороз');
    expect(field()).toBe(document.activeElement);
    expect(field().getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter on an open list does not submit the form', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      provider(
        createElement(
          'form',
          { onSubmit },
          createElement(Controlled),
          createElement('button', { type: 'submit' }, 'Надіслати'),
        ),
      ),
    );
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Escape closes the list, restores the selected label and leaves the value alone', async () => {
    const onValueChange = vi.fn();
    renderCombobox({ initial: 'z', onValueChange });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.keyboard('ол');
    expect(field().value).toBe('ол');
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(field().value).toBe('Зоя Петренко');
    expect(field()).toBe(document.activeElement);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('Tab closes the list without choosing and moves on', async () => {
    const onValueChange = vi.fn();
    render(
      provider(
        createElement(
          'div',
          null,
          createElement(Controlled, { onValueChange }),
          createElement('button', { type: 'button' }, 'Далі'),
        ),
      ),
    );
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await screen.findByRole('listbox');
    await userEvent.tab();
    await closed();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Далі' })).toBe(
      document.activeElement,
    );
  });

  it('closing it again starts the next open on the selected option with the full list', async () => {
    renderCombobox({ initial: 'o' });
    await userEvent.click(field());
    await userEvent.keyboard('зо{Escape}');
    await closed();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    expect(rows()).toHaveLength(5);
    expect(activeRow()).toBe(rows()[2]);
  });
});

describe('Combobox pointer [UI foundation F4]', () => {
  it('a click on an option chooses it, closes the list and the input keeps focus', async () => {
    const onValueChange = vi.fn();
    renderCombobox({ onValueChange });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.click(rows()[4]!);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('z');
    await closed();
    expect(field().value).toBe('Зоя Петренко');
    expect(field()).toBe(document.activeElement);
  });

  it('a disabled option cannot be chosen', async () => {
    const onValueChange = vi.fn();
    renderCombobox({ onValueChange });
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.click(rows()[3]!);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('hovering moves the active option', async () => {
    renderCombobox();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.hover(rows()[2]!);
    expect(activeRow()).toBe(rows()[2]);
  });

  it('clicking the field again keeps the list open; clicking elsewhere closes it', async () => {
    render(
      provider(
        createElement(
          'div',
          null,
          createElement(Controlled),
          createElement('button', { type: 'button' }, 'Поза полем'),
        ),
      ),
    );
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.click(field());
    expect(screen.getByRole('listbox')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Поза полем' }));
    await closed();
  });
});

describe('Combobox clear button [UI foundation F4]', () => {
  it('is a labelled button that empties the value and returns focus to the input', async () => {
    const onValueChange = vi.fn();
    renderCombobox({ initial: 'z', clearable: true, onValueChange });
    await userEvent.click(screen.getByRole('button', { name: 'Очистити' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('');
    expect(field().value).toBe('');
    expect(field()).toBe(document.activeElement);
    expect(screen.queryByRole('button', { name: 'Очистити' })).toBeNull();
  });

  it('is reachable with Tab and closes the open list when it takes focus', async () => {
    renderCombobox({ initial: 'z', clearable: true });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Очистити' })).toBe(
      document.activeElement,
    );
    await closed();
  });

  it('is absent when not clearable, empty or disabled', () => {
    const { unmount } = renderCombobox({ initial: 'z' });
    expect(screen.queryByRole('button', { name: 'Очистити' })).toBeNull();
    unmount();
    const empty = renderCombobox({ clearable: true });
    expect(screen.queryByRole('button', { name: 'Очистити' })).toBeNull();
    empty.unmount();
    renderCombobox({ initial: 'z', clearable: true, disabled: true });
    expect(screen.queryByRole('button', { name: 'Очистити' })).toBeNull();
    expect(field().disabled).toBe(true);
  });
});

describe('Combobox inside a Dialog [UI foundation F4]', () => {
  const inDialog = () =>
    render(
      provider(
        createElement(Dialog, {
          defaultOpen: true,
          children: createElement(
            DialogContent,
            { closeLabel: 'Закрити' },
            createElement(DialogTitle, null, 'Нова вакансія'),
            createElement(DialogDescription, null, 'Заповніть поля'),
            createElement(Controlled),
          ),
        }),
      ),
    );

  it('Escape closes the list first and the dialog only on the second press', async () => {
    inDialog();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await closed();
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an option can be picked without the dialog closing', async () => {
    inDialog();
    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.click(rows()[2]!);
    await closed();
    expect(field().value).toBe('Олена Дем’янчук');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
