// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DetailHeader } from '@/components/ui/detail-header';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import { RowSkeleton } from '@/components/vacancies/row-skeleton';
import messages from '../../../messages/uk.json' with { type: 'json' };

afterEach(cleanup);

const provider = (child: ReactElement) =>
  createElement(NextIntlClientProvider, {
    locale: 'uk',
    messages: { states: messages.states, vacancies: messages.vacancies },
    children: child,
  });

describe('DetailHeader [UI foundation F9, G17]', () => {
  it('renders the title as literal text clamped to three lines with the full text in title', () => {
    const title = 'Медіабаєр &amp; <b>Facebook</b> — перший рівень';
    const { container } = render(
      createElement(DetailHeader, { eyebrow: 'V-0009', title }),
    );
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe(title);
    expect(heading.getAttribute('title')).toBe(title);
    expect(heading.className).toContain('line-clamp-3');
    expect(heading.className).toContain('[overflow-wrap:anywhere]');
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders the actions row only when actions are passed, in the given order', () => {
    const { container, rerender } = render(
      createElement(DetailHeader, { title: 'Вакансія' }),
    );
    expect(
      container.querySelector('[data-slot="detail-header-actions"]'),
    ).toBeNull();
    rerender(
      createElement(DetailHeader, {
        title: 'Вакансія',
        actions: [
          createElement('button', { key: 'a' }, 'Редагувати'),
          createElement('button', { key: 'b' }, 'Опублікувати'),
        ],
      }),
    );
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Редагувати', 'Опублікувати']);
    rerender(
      createElement(DetailHeader, { title: 'Вакансія', actions: false }),
    );
    expect(
      container.querySelector('[data-slot="detail-header-actions"]'),
    ).toBeNull();
  });

  it('leaves the heading to the page when no title is passed', () => {
    render(createElement(DetailHeader, { eyebrow: 'V-0009' }));
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('RowSkeleton [UI foundation F9, G20]', () => {
  it('announces loading once and renders the table and the phone card for every row', () => {
    const { container } = render(
      provider(createElement(RowSkeleton, { count: 3 })),
    );
    expect(screen.getByRole('status').textContent).toContain(
      messages.states.loading,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(container.querySelectorAll('ul > li')).toHaveLength(3);
    expect(container.querySelector('.skeleton-delayed')).not.toBeNull();
    expect(
      container.querySelector('[aria-hidden="true"] table'),
    ).not.toBeNull();
  });
});

describe('FormSkeleton [UI foundation F9, G20]', () => {
  it('keeps the real heading and back link and draws one box per field plus the footer', () => {
    const { container } = render(
      provider(
        createElement(FormSkeleton, {
          title: 'Нова вакансія',
          back: { href: '/vacancies', label: 'До вакансій' },
          fields: ['input', 'textarea'],
        }),
      ),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Нова вакансія',
    );
    expect(screen.getByRole('link', { name: 'До вакансій' })).toBeTruthy();
    expect(
      container.querySelectorAll('[data-slot="control-skeleton"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '[data-slot="form-page-footer"] [data-slot="skeleton"]',
      ),
    ).toHaveLength(3);
    expect(container.querySelector('input, textarea, button')).toBeNull();
  });
});
