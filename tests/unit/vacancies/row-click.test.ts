// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement(
      'a',
      { href, onClick: (event: Event) => event.preventDefault() },
      children,
    ),
}));
// The real menu is portalled like this one: its items live in `document.body`, outside the row's DOM.
vi.mock('@/components/vacancies/draft-row-menu', () => ({
  DraftRowMenu: () =>
    createElement(
      'span',
      null,
      createPortal(
        createElement('div', { role: 'menuitem' }, 'Редагувати'),
        document.body,
      ),
    ),
}));

const row = (): VacancySummary => ({
  id: crypto.randomUUID(),
  number: 'V-0015',
  title: 'Медіабаєр — Facebook',
  vertical: { id: crypto.randomUUID(), name: 'Гемблінг' },
  position: null,
  teamLead: null,
  recruiters: [],
  status: 'DRAFT',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: null,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
});

afterEach(cleanup);

describe('a click in a row selects it, but not a click that bubbles out of a portalled menu', () => {
  const mountList = (
    onSelect: (id: string | undefined) => void,
    item: VacancySummary,
  ) =>
    render(
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        timeZone: 'Europe/Kyiv',
        messages,
        children: createElement(VacanciesList, {
          items: [item],
          selectedId: undefined,
          wide: true,
          onSelect,
          onPreviewIntent: vi.fn(),
          canAuthorDrafts: true,
          selfAssignVerticals: [],
          statusGrants: null,
        }),
      }),
    );

  it('a click on a plain cell selects the row', async () => {
    const item = row();
    const onSelect = vi.fn();
    mountList(onSelect, item);
    const table = screen.getByRole('table');
    await userEvent.click(within(table).getAllByRole('cell')[0]!);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(item.id);
  });

  it('a click on a menu item (React bubbles it through the portal) leaves the selection alone', async () => {
    const onSelect = vi.fn();
    mountList(onSelect, row());
    // The mobile list renders the same mock; any copy is outside every row's DOM.
    const [menuItem] = screen.getAllByRole('menuitem');
    await userEvent.click(menuItem!);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
