// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FilterChips,
  type FilterChipsProps,
} from '@/components/ui/filter-chips';

const options = [
  { value: '', label: 'Усі', count: 1284 },
  { value: 'OPEN', label: 'Відкриті', count: 24, disabled: true },
  { value: 'DRAFT', label: 'Чернетки', count: 1 },
  { value: 'ON_HOLD', label: 'Призупинені', count: 0 },
  { value: 'FILLED', label: 'Заповнені' },
];
const props = { options, value: '', label: 'Статуси', onValueChange: vi.fn() };
let resize: () => void;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  props.onValueChange.mockClear();
});

function Controlled() {
  const [value, onValueChange] = useState('');
  return createElement(FilterChips, { ...props, value, onValueChange });
}

describe('FilterChips [F6a, VAC-02, UX accessibility]', () => {
  it('names the group and radios, preserves zero and formats counts with NBSP', () => {
    render(createElement(FilterChips, props));
    expect(screen.getByRole('radiogroup', { name: 'Статуси' })).toBeTruthy();
    expect(
      screen
        .getByRole('radio', { name: 'Усі, 1\u00a0284' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: 'Призупинені, 0' }).textContent,
    ).toBe('Призупинені0');
    expect(
      screen.getByRole('radio', { name: 'Заповнені' }).childElementCount,
    ).toBe(0);
  });

  it('wraps arrows, skips disabled options, supports Home/End and a single Tab stop', async () => {
    const user = userEvent.setup();
    render(createElement(Controlled));
    await user.tab();
    const selected = () => screen.getByRole('radio', { checked: true });
    expect(document.activeElement).toBe(selected());
    await user.keyboard('{ArrowRight}');
    expect(selected().getAttribute('aria-label')).toBe('Чернетки, 1');
    await user.keyboard('{End}{ArrowDown}');
    expect(selected().getAttribute('aria-label')).toBe('Усі, 1\u00a0284');
    await user.keyboard('{ArrowLeft}');
    expect(selected().getAttribute('aria-label')).toBe('Заповнені');
    await user.keyboard('{Home}{ArrowUp}');
    expect(document.activeElement).toBe(selected());
    expect(
      screen.getAllByRole('radio').filter((radio) => radio.tabIndex === 0),
    ).toEqual([selected()]);
  });

  it('requests selection without changing a controlled value and ignores reselection', async () => {
    const user = userEvent.setup();
    render(createElement(FilterChips, props));
    await user.click(screen.getByRole('radio', { checked: true }));
    expect(props.onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'Чернетки, 1' }));
    expect(props.onValueChange).toHaveBeenCalledWith('DRAFT');
    expect(
      screen.getByRole('radio', { checked: true }).getAttribute('aria-label'),
    ).toBe('Усі, 1\u00a0284');
  });

  it('renders nothing for empty options', () => {
    const { container } = render(
      createElement(FilterChips, { ...props, options: [] }),
    );
    expect(container.firstChild).toBeNull();
  });

  it.each([
    { disabled: true },
    { options: options.map((option) => ({ ...option, disabled: true })) },
  ])('has no Tab stop for disabled groups %j', (overrides) => {
    render(createElement(FilterChips, { ...props, ...overrides }));
    expect(screen.getByRole('radiogroup').tabIndex).toBe(-1);
    expect(screen.getByRole('radiogroup').getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(
      screen.queryAllByRole('radio').some((radio) => radio.tabIndex === 0),
    ).toBe(false);
  });

  it('uses the first enabled item if the selected option is missing or disabled', () => {
    const { rerender } = render(
      createElement(FilterChips, { ...props, value: 'missing' }),
    );
    const firstEnabled = () =>
      screen.getByRole('radio', { name: 'Усі, 1 284' });
    expect(firstEnabled().tabIndex).toBe(0);
    rerender(createElement(FilterChips, { ...props, value: 'OPEN' }));
    expect(firstEnabled().tabIndex).toBe(0);
    expect(props.onValueChange).not.toHaveBeenCalled();
  });

  it('keeps a manual scroll position when the parent re-renders with an equal options array', () => {
    const { rerender } = render(
      createElement(FilterChips, { ...props, options: [...options] }),
    );
    const row = screen.getByRole('radiogroup');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
    } as DOMRect);
    vi.spyOn(
      screen.getByRole('radio', { checked: true }),
      'getBoundingClientRect',
    ).mockReturnValue({ left: -300, right: -200, width: 100 } as DOMRect);
    row.scrollLeft = 150;
    rerender(createElement(FilterChips, { ...props, options: [...options] }));
    expect(row.scrollLeft).toBe(150);
  });

  it('aligns the start of a chip wider than the visible row', () => {
    const { rerender } = render(createElement(FilterChips, props));
    const row = screen.getByRole('radiogroup');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
    } as DOMRect);
    vi.spyOn(
      screen.getByRole('radio', { name: 'Заповнені' }),
      'getBoundingClientRect',
    ).mockReturnValue({ left: 300, right: 460, width: 160 } as DOMRect);
    row.scrollLeft = 0;
    rerender(createElement(FilterChips, { ...props, value: 'FILLED' }));
    expect(row.scrollLeft).toBe(280);
  });

  it('reveals external selection horizontally and recalculates overflow after scroll and resize', () => {
    const { rerender } = render(createElement(FilterChips, props));
    const row = screen.getByRole('radiogroup');
    Object.defineProperties(row, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { value: 600 },
    });
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
    } as DOMRect);
    const chip = screen.getByRole('radio', { name: 'Заповнені' });
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
      left: 400,
      right: 500,
      width: 100,
    } as DOMRect);
    row.scrollLeft = 0;
    row.scrollTop = 7;
    rerender(
      createElement(FilterChips, {
        ...props,
        value: 'FILLED',
      } satisfies FilterChipsProps),
    );
    expect(row.scrollLeft).toBe(380);
    expect(row.scrollTop).toBe(7);
    expect(row.dataset.overflowStart).toBe('true');
    row.scrollLeft = 400;
    fireEvent.scroll(row);
    expect(row.dataset.overflowEnd).toBe('false');
    Object.defineProperty(row, 'clientWidth', { value: 600 });
    row.scrollLeft = 0;
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      right: 100,
      width: 80,
    } as DOMRect);
    act(() => resize());
    expect(row.dataset.overflowStart).toBe('false');
    expect(row.dataset.overflowEnd).toBe('false');
  });
});
