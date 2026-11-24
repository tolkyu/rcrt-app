// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowSkeleton } from '@/components/vacancies/row-skeleton';
import { StatusHeaderActions } from '@/components/vacancies/status-header-actions';
import { UrgencySection } from '@/components/vacancies/urgency-section';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import { VacancyOverview } from '@/components/vacancies/vacancy-overview';
import messages from '@/messages/uk.json';
import {
  mountInUk,
  shareVacancy,
  stubClipboard,
} from '@/tests/support/vacancy-share-harness';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/vacancies',
  useSearchParams: () => new URLSearchParams(),
}));

const t = messages.vacancies;

const mount = (node: ReactElement) =>
  mountInUk(
    createElement(QueryClientProvider, {
      client: new QueryClient(),
      children: node,
    }),
  );

const list = () =>
  createElement(VacanciesList, {
    items: [shareVacancy()],
    selectedId: undefined,
    wide: true,
    onSelect: () => undefined,
    onPreviewIntent: () => undefined,
    canAuthorDrafts: false,
    selfAssignVerticals: [],
    statusGrants: null,
  });

const headCell = (name: string) => screen.getByRole('columnheader', { name });

afterEach(cleanup);

describe('list beside the preview at 1280-1720 px [VAC-04, M5]', () => {
  it('hides «Вертикаль» below 1600 px and «Відкрито» below 1720 px, in head and body', () => {
    mount(list());
    const row = screen.getAllByRole('row')[1]!;
    const cells = within(row).getAllByRole('cell');
    expect(headCell(t.columns.vertical).className).toContain(
      'xl:max-[1600px]:hidden',
    );
    expect(cells[0]!.className).toContain('xl:max-[1600px]:hidden');
    expect(headCell(t.columns.openedAt).className).toContain(
      'xl:max-[1720px]:hidden',
    );
    expect(cells[4]!.className).toContain('xl:max-[1720px]:hidden');
  });

  it('narrows the title column only while the preview shares the row', () => {
    mount(list());
    const title = headCell(t.columns.title).className;
    expect(title).toContain('min-w-56');
    expect(title).toContain('xl:max-2xl:min-w-48');
  });

  it('keeps row actions pinned on an opaque background', () => {
    mount(list());
    const head = headCell(t.columns.preview).className;
    expect(head).toContain('sticky');
    expect(head).toContain('right-0');
    expect(head).toContain('bg-surface');
    const row = screen.getAllByRole('row')[1]!;
    expect(row.className).toContain('bg-surface');
    const actions = within(row).getAllByRole('cell').at(-1)!.className;
    expect(actions).toContain('sticky');
    expect(actions).toContain('bg-inherit');
  });

  it('the skeleton hides the same columns and does not widen the title', () => {
    const { container } = (() => {
      mount(createElement(RowSkeleton, { count: 1 }));
      return { container: document.body };
    })();
    const cells = container.querySelectorAll('tbody td');
    expect(cells[1]!.className).toContain('xl:max-[1600px]:hidden');
    expect(cells[5]!.className).toContain('xl:max-[1720px]:hidden');
    expect(cells[6]!.className).toContain('sticky');
    expect(
      cells[0]!.querySelector('[data-slot="skeleton"]')?.className,
    ).toContain('xl:max-2xl:w-40');
  });
});

describe('preview share button [UI-09, M6]', () => {
  const share = () => screen.getByRole('button', { name: t.share });

  it('is an icon button named by aria-label in the preview', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: shareVacancy(),
        preview: true,
      }),
    );
    expect(share().getAttribute('aria-label')).toBe(t.share);
    expect(share().textContent).toBe('');
    expect(share().className).toContain('size-11');
  });

  it('keeps its text on the card', () => {
    mount(createElement(VacancyOverview, { vacancy: shareVacancy() }));
    expect(share().textContent).toBe(t.share);
  });

  it('stretches beside «⋯» on a phone', () => {
    mount(createElement(VacancyOverview, { vacancy: shareVacancy() }));
    expect(share().className).toContain('max-md:flex-1');
  });

  it('aligns «Закрити» of the clipboard fallback with the panel text', async () => {
    stubClipboard(() => Promise.reject(new Error('blocked')));
    mount(createElement(VacancyOverview, { vacancy: shareVacancy() }));
    await userEvent.click(share());
    const alert = await screen.findByRole('alert');
    const close = within(alert).getByRole('button', {
      name: messages.common.close,
    });
    expect(close.className).toContain('-ml-3');
    expect(close.className).toContain('px-3');
    expect(close.className).toContain('h-11');
  });
});

describe('urgency section label [VAC-08-2, V3 #3]', () => {
  it('shows one visible label and keeps the name of the group', async () => {
    mount(
      createElement(UrgencySection, {
        vacancy: shareVacancy({ canChangeUrgency: true }),
        preview: false,
        Heading: 'h2',
        onRemoved: () => undefined,
      }),
    );
    expect(screen.getByRole('heading', { name: t.urgency.title })).toBeTruthy();
    expect(screen.getByText(t.urgency.label).className).toContain('sr-only');
    expect(
      await screen.findByRole('radiogroup', { name: t.urgency.label }),
    ).toBeTruthy();
  });
});

describe('desktop header action order [VAC-02, V3 #4]', () => {
  it('keeps «⋯» after the status action from 768 px', async () => {
    mount(
      createElement(StatusHeaderActions, {
        vacancy: shareVacancy({ statusActions: ['HOLD', 'CANCEL'] }),
        preview: false,
      }),
    );
    const hold = await screen.findByRole('button', {
      name: t.statusMenu.hold,
    });
    const more = screen.getByRole('button', {
      name: t.statusMenu.menuLabel.replace('{title}', shareVacancy().title),
    });
    expect(
      hold.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('locked status action on a phone [VAC-02, D63]', () => {
  it('fills the status row while it waits for 2FA', async () => {
    mount(
      createElement(StatusHeaderActions, {
        vacancy: shareVacancy({ statusActions: [], needsMfa: true }),
        preview: false,
      }),
    );
    const hold = await screen.findByRole('button', {
      name: t.statusMenu.hold,
    });
    expect(hold.getAttribute('aria-disabled')).toBe('true');
    expect(hold.className).toContain('max-md:w-full');
    expect(hold.parentElement!.className).toContain('max-md:w-full');
  });
});

describe('closed urgent header [VAC-02, V3 #7]', () => {
  it.each(['FILLED', 'CANCELLED'] as const)(
    '%s: one closing notice, and the neutral chip keeps its title',
    (status) => {
      mount(
        createElement(VacancyOverview, {
          vacancy: shareVacancy({ priority: 'URGENT', status }),
        }),
      );
      expect(screen.queryByText(t.urgentClosed)).toBeNull();
      expect(screen.getByTitle(t.urgentClosed).textContent).toContain(t.urgent);
      expect(
        screen.getByText(
          status === 'FILLED' ? /Вакансію закрито/ : /Вакансію скасовано/,
        ),
      ).toBeTruthy();
    },
  );
});
