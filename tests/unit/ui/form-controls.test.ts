// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, createRef, useState, type ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Checkbox } from '@/components/ui/checkbox';
import { Counter } from '@/components/ui/counter';
import { FormError } from '@/components/ui/form-error';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import messages from '../../../messages/uk.json' with { type: 'json' };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const provider = (child: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { form: messages.form },
    children: child,
  });

describe('Counter [UI foundation F5]', () => {
  it('shows count/max visually and speaks the sentence once as the description', () => {
    const { container } = render(
      provider(createElement(Counter, { id: 'c', count: 120, max: 500 })),
    );
    const counter = container.querySelector('#c')!;
    expect(counter.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      '120/500',
    );
    expect(counter.querySelector('.sr-only')?.textContent).toBe(
      'Символів: 120 із 500',
    );
    expect(counter.hasAttribute('data-over')).toBe(false);
  });

  it('turns the error colour and says so over the limit, but not at the limit', () => {
    const { container, rerender } = render(
      provider(createElement(Counter, { id: 'c', count: 500, max: 500 })),
    );
    expect(container.querySelector('#c')?.hasAttribute('data-over')).toBe(
      false,
    );
    rerender(
      provider(createElement(Counter, { id: 'c', count: 501, max: 500 })),
    );
    const counter = container.querySelector('#c')!;
    expect(counter.hasAttribute('data-over')).toBe(true);
    expect(counter.querySelector('.sr-only')?.textContent).toBe(
      'Символів: 501 із 500, ліміт перевищено',
    );
  });
});

describe('Textarea [UI foundation F5]', () => {
  it('never caps typing: no maxlength, so the counter can show the overflow', () => {
    render(createElement(Textarea, { 'aria-label': 'Опис' }));
    const area = screen.getByRole('textbox', { name: 'Опис' });
    expect(area.hasAttribute('maxlength')).toBe(false);
  });
});

describe('Checkbox [UI foundation F5]', () => {
  it('toggles with the pointer and Space, and reports aria-checked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(createElement(Checkbox, { 'aria-label': 'Згода', onCheckedChange }));
    const box = screen.getByRole('checkbox', { name: 'Згода' });
    await user.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    await user.keyboard(' ');
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(onCheckedChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe('RadioGroup [UI foundation F5]', () => {
  const group = (onValueChange: (value: string) => void) =>
    createElement(
      RadioGroup,
      { 'aria-label': 'Канал', defaultValue: 'email', onValueChange },
      createElement(RadioGroupItem, {
        id: 'r-email',
        value: 'email',
        label: 'Пошта',
      }),
      createElement(RadioGroupItem, {
        id: 'r-phone',
        value: 'phone',
        label: 'Телефон',
      }),
    );

  it('labels every radio, moves with arrows and selects by clicking the label', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(group(onValueChange));
    const email = screen.getByRole('radio', { name: 'Пошта' });
    const phone = screen.getByRole('radio', { name: 'Телефон' });
    expect(email.getAttribute('aria-checked')).toBe('true');
    email.focus();
    await user.keyboard('{ArrowDown>}');
    expect(document.activeElement).toBe(phone);
    await waitFor(() =>
      expect(phone.getAttribute('aria-checked')).toBe('true'),
    );
    await user.keyboard('{/ArrowDown}');
    await user.click(screen.getByText('Пошта'));
    expect(email.getAttribute('aria-checked')).toBe('true');
    expect(onValueChange.mock.calls).toEqual([['phone'], ['email']]);
  });
});

describe('SegmentedControl [UI foundation F5]', () => {
  const options = [
    { value: 'normal', label: 'Звичайна' },
    { value: 'urgent', label: 'Термінова' },
  ];
  const three = [...options, { value: 'asap', label: 'Негайна' }];

  function Controlled({
    onChange,
    choices = options,
    initial = 'normal',
  }: {
    onChange: (value: string) => void;
    choices?: typeof options;
    initial?: string;
  }) {
    const [value, setValue] = useState(initial);
    return createElement(
      'div',
      null,
      createElement('button', { type: 'button' }, 'До'),
      createElement(SegmentedControl, {
        'aria-label': 'Пріоритет',
        options: choices,
        value,
        onValueChange: (next) => {
          onChange(next);
          setValue(next);
        },
      }),
      createElement('button', { type: 'button' }, 'Після'),
    );
  }

  const checked = () =>
    screen
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-checked'));

  it('is a labelled radio group whose items select on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(createElement(Controlled, { onChange }));
    const radios = screen.getAllByRole('radio');
    expect(screen.getByRole('radiogroup', { name: 'Пріоритет' })).toBeTruthy();
    expect(checked()).toEqual(['true', 'false']);
    await user.click(radios[1]!);
    expect(checked()).toEqual(['false', 'true']);
    expect(onChange).toHaveBeenLastCalledWith('urgent');
  });

  it('never ends up with nothing selected when the checked item is pressed again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(createElement(Controlled, { onChange }));
    await user.click(screen.getByRole('radio', { name: 'Звичайна' }));
    expect(checked()).toEqual(['true', 'false']);
  });

  it('Tab enters on the checked item and leaves the group in one press', async () => {
    const user = userEvent.setup();
    render(createElement(Controlled, { onChange: vi.fn(), initial: 'urgent' }));
    await user.click(screen.getByRole('button', { name: 'До' }));
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: 'Термінова' }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Після' }),
    );
  });

  it('arrows move focus and select, wrapping at both ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      createElement(Controlled, { onChange, choices: three, initial: 'asap' }),
    );
    screen.getByRole('radio', { name: 'Негайна' }).focus();
    // Held key: Radix selects on focus only while an arrow is down, and moves focus on a later task.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(checked()).toEqual(['true', 'false', 'false']));
    await user.keyboard('{/ArrowRight}{ArrowLeft>}');
    await waitFor(() => expect(checked()).toEqual(['false', 'false', 'true']));
    await user.keyboard('{/ArrowLeft}{ArrowDown>}');
    await waitFor(() => expect(checked()).toEqual(['true', 'false', 'false']));
    await user.keyboard('{/ArrowDown}');
    expect(onChange.mock.calls).toEqual([['normal'], ['asap'], ['normal']]);
  });

  it('honours the react-hook-form contract: ref.focus() lands on the checked radio and blur is reported', () => {
    const ref = createRef<HTMLDivElement>();
    const onBlur = vi.fn();
    render(
      createElement(SegmentedControl, {
        ref,
        'aria-label': 'Пріоритет',
        options,
        value: 'urgent',
        onValueChange: vi.fn(),
        onBlur,
      }),
    );
    act(() => ref.current!.focus());
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: 'Термінова' }),
    );
    onBlur.mockClear();
    act(() => (document.activeElement as HTMLElement).blur());
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('Space selects the focused item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(createElement(Controlled, { onChange }));
    screen.getByRole('radio', { name: 'Термінова' }).focus();
    await user.keyboard(' ');
    expect(checked()).toEqual(['false', 'true']);
    expect(onChange).toHaveBeenCalledWith('urgent');
  });
});

describe('FormError [UI foundation F5]', () => {
  it.each([
    [1, 'Виправте 1 поле'],
    [2, 'Виправте 2 поля'],
    [4, 'Виправте 4 поля'],
    [5, 'Виправте 5 полів'],
    [11, 'Виправте 11 полів'],
    [12, 'Виправте 12 полів'],
    [21, 'Виправте 21 поле'],
    [23, 'Виправте 23 поля'],
    [25, 'Виправте 25 полів'],
  ])('uses the Ukrainian plural form for %i', (count, text) => {
    render(provider(createElement(FormError, { count, attempt: 1 })));
    expect(screen.getByRole('alert').textContent).toBe(text);
  });

  it('renders nothing without errors and re-mounts the alert for every failed submit', () => {
    const { rerender } = render(
      provider(createElement(FormError, { count: 0, attempt: 0 })),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(provider(createElement(FormError, { count: 2, attempt: 1 })));
    const first = screen.getByRole('alert');
    rerender(provider(createElement(FormError, { count: 2, attempt: 1 })));
    expect(screen.getByRole('alert')).toBe(first);
    rerender(provider(createElement(FormError, { count: 2, attempt: 2 })));
    expect(screen.getByRole('alert')).not.toBe(first);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});
