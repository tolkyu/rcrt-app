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
  it('draws group bars, grid rows and reserved hints for the vacancy form [S3.1]', () => {
    const { container } = render(
      provider(
        createElement(FormSkeleton, {
          title: 'Нова вакансія',
          back: { href: '/vacancies', label: 'До вакансій' },
          fields: [
            'group',
            ['input', { kind: 'input', hint: true }],
            { kind: 'input', hint: true },
            [
              { kind: 'input', hint: true },
              { kind: 'segmented', hint: true },
            ],
            ['input', 'input', 'input'],
          ],
        }),
      ),
    );
    expect(
      container.querySelectorAll('[data-slot="form-group-skeleton"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-slot="control-skeleton"]'),
    ).toHaveLength(8);
    const rows = [
      ...container.querySelectorAll('[data-slot="form-skeleton"] > .grid'),
    ];
    expect(rows.map((row) => row.children.length)).toEqual([2, 2, 3]);
    expect(rows.map((row) => row.className)).toEqual([
      expect.stringContaining('md:grid-cols-2'),
      expect.stringContaining('md:grid-cols-2'),
      expect.stringContaining('md:grid-cols-3'),
    ]);
    const hints = container.querySelectorAll(
      '[data-slot="form-hint-skeleton"]',
    );
    expect(hints).toHaveLength(4);
    const controls = [
      ...container.querySelectorAll('[data-slot="control-skeleton"]'),
    ];
    expect(
      controls.filter((control) => control.className.includes('h-[3.375rem]')),
    ).toHaveLength(1);
  });

  it('reserves as many hint lines as the real helper text wraps to, per width', () => {
    const lines = (hint: boolean | number | { base: number; md: number }) => {
      const { container } = render(
        provider(
          createElement(FormSkeleton, {
            title: 'Форма',
            back: { href: '/', label: 'Назад' },
            fields: [{ kind: 'input', hint }],
          }),
        ),
      );
      const found = [
        ...container.querySelectorAll('[data-slot="form-hint-line-skeleton"]'),
      ].map((line) => line.className);
      cleanup();
      return found;
    };
    expect(lines(true)).toEqual(['h-4 items-center flex md:flex']);
    expect(lines(false)).toEqual([]);
    expect(lines(0)).toEqual([]);
    expect(lines(2)).toHaveLength(2);
    expect(lines({ base: 3, md: 1 })).toEqual([
      'h-4 items-center flex md:flex',
      'h-4 items-center flex md:hidden',
      'h-4 items-center flex md:hidden',
    ]);
    expect(lines({ base: 1, md: 2 })).toEqual([
      'h-4 items-center flex md:flex',
      'h-4 items-center hidden md:flex',
    ]);
  });

  it('keeps the flat field list of earlier callers as one full-width column', () => {
    const { container } = render(
      provider(
        createElement(FormSkeleton, {
          title: 'Форма',
          back: { href: '/', label: 'Назад' },
          fields: ['input', 'textarea'],
        }),
      ),
    );
    expect(
      container.querySelector('[data-slot="form-skeleton"] > .grid'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="form-group-skeleton"]'),
    ).toBeNull();
  });
});
