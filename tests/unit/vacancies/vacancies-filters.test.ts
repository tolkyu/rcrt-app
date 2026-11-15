// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type * as ReactQuery from '@tanstack/react-query';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacanciesView } from '@/components/vacancies/vacancies-view';
import messages from '@/messages/uk.json';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/use-wide-screen', () => ({ useWideScreen: () => false }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ prefetchQuery: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'verticals'
      ? { data: { items: [] } }
      : { data: undefined, isPlaceholderData: false, isError: false },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.history.replaceState(null, '', '/vacancies');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const view = (canAuthorDrafts = true) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    timeZone: 'Europe/Kyiv',
    messages,
    children: createElement(VacanciesView, {
      canManagePositions: false,
      canAuthorDrafts,
    }),
  });
const status = (name: string) => screen.getByRole('radio', { name });

describe('vacancy filter integration [F6b, VAC-04, D92]', () => {
  it('uses plural statuses without invented counts and hides drafts for non-authors', () => {
    const { rerender } = render(view());
    expect(
      screen.getAllByRole('radio').map((radio) => radio.textContent),
    ).toEqual([
      'Усі',
      'Відкриті',
      'Чернетки',
      'Призупинені',
      'Заповнені',
      'Скасовані',
    ]);
    rerender(view(false));
    expect(screen.queryByRole('radio', { name: 'Чернетки' })).toBeNull();
    window.history.replaceState(null, '', '/vacancies?status=DRAFT');
    rerender(view(false));
    expect(status('Усі').getAttribute('aria-checked')).toBe('true');
    expect(window.location.search).toBe('');
  });

  it('replaces history on keyboard selection, clears cursor/preview, and preserves a pending search', () => {
    window.history.replaceState(
      null,
      '',
      '/vacancies?cursor=3&vacancy=00000000-0000-4000-8000-000000000001',
    );
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    const { rerender } = render(view());
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Media' },
    });
    act(() => status('Усі').focus());
    fireEvent.keyDown(status('Усі'), { key: 'ArrowRight' });
    rerender(view());
    expect(status('Відкриті').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(status('Відкриті'));
    expect(window.location.search).toBe('?status=OPEN');
    act(() => vi.advanceTimersByTime(300));
    rerender(view());
    expect(new URLSearchParams(window.location.search).get('status')).toBe(
      'OPEN',
    );
    expect(new URLSearchParams(window.location.search).get('q')).toBe('Media');
    expect(replace).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it('follows external URL changes and reset clears a pending search', () => {
    const { rerender } = render(view());
    window.history.replaceState(null, '', '/vacancies?status=DRAFT&q=Media');
    rerender(view());
    expect(status('Чернетки').getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
      'Media',
    );
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Crypto' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: messages.vacancies.resetFilters }),
    );
    act(() => vi.advanceTimersByTime(300));
    rerender(view());
    expect(window.location.search).toBe('');
    expect(status('Усі').getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
});
