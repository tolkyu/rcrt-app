// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, within } from '@testing-library/react';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowSkeleton } from '@/components/vacancies/row-skeleton';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import { VacancyStatus } from '@/components/vacancies/vacancy-badges';
import { VacancyDetailView } from '@/components/vacancies/vacancy-detail-view';
import messages from '@/messages/uk.json';
import { mountInUk, shareVacancy } from '@/tests/support/vacancy-share-harness';

vi.mock('next/link', () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children?: ReactNode;
  }) => createElement('a', { href, className }, children),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/vacancies',
  useSearchParams: () => new URLSearchParams(),
}));

const t = messages.vacancies;

const mount = (node: ReactElement) =>
  mountInUk(
    createElement(QueryClientProvider, {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
      children: node,
    }),
  );

const list = (showTeamLead: boolean) =>
  createElement(VacanciesList, {
    items: [
      shareVacancy({
        teamLead: {
          id: crypto.randomUUID(),
          fullName: 'Василь Петренко',
          isActive: true,
        },
      }),
    ],
    selectedId: undefined,
    wide: true,
    onSelect: () => undefined,
    onPreviewIntent: () => undefined,
    canAuthorDrafts: false,
    selfAssignVerticals: [],
    statusGrants: null,
    showTeamLead,
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('«Заповнена» chip on a selected row [VAC-04]', () => {
  it('is an outline chip, so the selected-row fill cannot swallow it', () => {
    mount(createElement(VacancyStatus, { status: 'FILLED' }));
    const chip = screen
      .getByText(t.status.FILLED)
      .closest('[data-slot="badge"]')!;
    expect(chip.className).toContain('bg-transparent');
    expect(chip.className).toContain('border-brand');
    expect(chip.className).not.toContain('bg-primary-subtle');
  });
});

describe('«Тімлід» column for a viewer who leads every row [VAC-04, S-04]', () => {
  it('keeps the column by default', () => {
    mount(list(true));
    expect(
      screen.getByRole('columnheader', { name: t.columns.teamLead }),
    ).toBeTruthy();
    expect(screen.getAllByText('Василь Петренко')).toHaveLength(2);
  });

  it('hides the header, the cell and the mobile line', () => {
    mount(list(false));
    expect(
      screen.queryByRole('columnheader', { name: t.columns.teamLead }),
    ).toBeNull();
    expect(screen.queryByText('Василь Петренко')).toBeNull();
    expect(screen.queryByText(t.teamLeadLine)).toBeNull();
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')).toHaveLength(5);
  });

  it('the skeleton drops the same column', () => {
    mount(createElement(RowSkeleton, { count: 1, showTeamLead: false }));
    expect(document.querySelectorAll('thead th')).toHaveLength(6);
    expect(document.querySelectorAll('tbody tr:first-child td')).toHaveLength(
      6,
    );
  });
});

describe('card back link [UI consistency]', () => {
  it('uses the muted form-page back link with a chevron and a 44 px target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({ code: 'NOT_FOUND' }, { status: 404 }),
      ),
    );
    mount(
      createElement(VacancyDetailView, {
        id: shareVacancy().id,
        canAuthorDrafts: false,
      }),
    );
    const back = await screen.findByRole('link', { name: t.detail.back });
    expect(back.className).toContain('text-muted-foreground');
    expect(back.className).toContain('min-h-11');
    expect(back.querySelector('svg.lucide-chevron-left')).not.toBeNull();
    expect(back.querySelector('svg.lucide-arrow-left')).toBeNull();
  });
});

describe('team copy [VAC-02]', () => {
  it('says the Team Lead is not assigned yet', () => {
    expect(t.team.noTeamLead).toBe('Тімліда ще не призначено');
  });
});
