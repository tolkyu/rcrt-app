// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterBar, FilterBarResults } from '@/components/ui/filter-bar';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FilterBar [F6b, VAC-04]', () => {
  it('keeps the controls and reset outside the dimmed, immediately busy results', () => {
    const ref = createRef<HTMLElement>();
    const page = (busy: boolean) =>
      createElement(
        'main',
        null,
        createElement(FilterBar, {
          label: 'Фільтри',
          reset: createElement('button', null, 'Скинути'),
          children: createElement('input', { 'aria-label': 'Пошук' }),
        }),
        createElement(FilterBarResults, {
          ref,
          busy,
          'aria-label': 'Результати',
          children: 'Вакансії',
        }),
      );
    const { rerender } = render(page(true));
    const results = screen.getByRole('region', { name: 'Результати' });
    expect(ref.current).toBe(results);
    expect(results.getAttribute('aria-busy')).toBe('true');
    act(() => vi.advanceTimersByTime(149));
    expect(results.dataset.dimmed).toBe('false');
    act(() => vi.advanceTimersByTime(1));
    expect(results.dataset.dimmed).toBe('true');
    expect(results.className).toContain('opacity-60');
    expect(results.className).not.toMatch(/transition|animate/);
    expect(results.contains(screen.getByRole('textbox'))).toBe(false);
    expect(results.contains(screen.getByRole('button'))).toBe(false);
    rerender(page(false));
    expect(ref.current).toBe(results);
    expect(results.getAttribute('aria-busy')).toBe('false');
    expect(results.dataset.dimmed).toBe('false');
  });

  it('cancels quick refreshes, restarts the full delay, and cleans up on unmount', () => {
    const view = (busy: boolean) =>
      createElement(FilterBarResults, {
        busy,
        'aria-label': 'Результати',
      });
    const { rerender, unmount } = render(view(true));
    act(() => vi.advanceTimersByTime(100));
    rerender(view(false));
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('region').dataset.dimmed).toBe('false');
    rerender(view(true));
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole('region').dataset.dimmed).toBe('true');
    rerender(view(false));
    rerender(view(true));
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByRole('region').dataset.dimmed).toBe('false');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
