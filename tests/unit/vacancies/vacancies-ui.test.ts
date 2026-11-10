// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import {
  VacancyFlags,
  VacancyStatus,
} from '@/components/vacancies/vacancy-badges';
import { VacancyOverview } from '@/components/vacancies/vacancy-overview';
import type { VacancyDetail, VacancySummary } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    prefetch?: boolean;
    children?: ReactNode;
  }) =>
    createElement(
      'a',
      {
        href,
        'data-prefetch': String(prefetch),
        onClick: (event: Event) => event.preventDefault(),
        ...props,
      },
      children,
    ),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast }));

const person = (name: string, isActive = true) => ({
  id: crypto.randomUUID(),
  fullName: name,
  isActive,
});
const summary = (overrides: Partial<VacancySummary> = {}): VacancySummary => ({
  id: crypto.randomUUID(),
  number: 'V-0001',
  title: 'Медіабаєр — Facebook',
  vertical: { id: crypto.randomUUID(), name: 'Гемблінг' },
  position: null,
  teamLead: person('Василь Петренко'),
  recruiters: [],
  status: 'OPEN',
  priority: 'NORMAL',
  source: 'APP',
  openedAt: '2026-10-22T09:00:00.000Z',
  createdAt: '2026-10-18T09:00:00.000Z',
  updatedAt: '2026-10-22T09:00:00.000Z',
  ...overrides,
});
const detail = (overrides: Partial<VacancyDetail> = {}): VacancyDetail => ({
  ...summary(),
  headcount: 2,
  seniority: null,
  workFormat: 'REMOTE',
  employmentType: null,
  location: null,
  salaryMinMinor: '150000',
  salaryMaxMinor: '250000',
  salaryCurrency: 'USD',
  probationDays: 90,
  recruiterInitiated: false,
  version: 1,
  ...overrides,
});

function mount(node: ReactElement) {
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      // A missing Ukrainian key must fail the test rather than render a key path.
      onError: (error) => {
        throw error;
      },
      children: node,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VacanciesList [STORY-VAC-04-1, UI-04..07]', () => {
  const first = summary({ priority: 'URGENT', source: 'TELEGRAM_BOT' });
  const second = summary({
    id: crypto.randomUUID(),
    number: 'V-0002',
    title: 'Affiliate Manager',
    teamLead: null,
    status: 'DRAFT',
    openedAt: null,
  });
  const list = (props: {
    items: VacancySummary[];
    selectedId?: string;
    wide?: boolean;
    onSelect?: (id: string) => void;
    onPreviewIntent?: (id: string) => void;
  }) =>
    createElement(VacanciesList, {
      items: props.items,
      selectedId: props.selectedId,
      wide: props.wide ?? false,
      onSelect: props.onSelect ?? vi.fn(),
      onPreviewIntent: props.onPreviewIntent ?? vi.fn(),
    });

  it('links each title to the real card and shows number, badges and honest placeholders', () => {
    mount(list({ items: [first, second] }));
    const table = screen.getByRole('table', {
      name: messages.vacancies.caption,
    });
    const link = within(table).getByRole('link', { name: first.title });
    expect(link.getAttribute('href')).toBe(`/vacancies/${first.id}`);
    expect(link.getAttribute('data-prefetch')).toBe('false');
    const row = link.closest('tr')!;
    expect(within(row).getByText(messages.vacancies.urgent)).toBeTruthy();
    expect(within(row).getByText(messages.vacancies.fromBot)).toBeTruthy();
    expect(within(row).getByText(messages.vacancies.status.OPEN)).toBeTruthy();
    const draft = within(table)
      .getByRole('link', { name: second.title })
      .closest('tr')!;
    expect(within(draft).getByText(messages.vacancies.unassigned)).toBeTruthy();
    expect(
      within(draft).getByText(messages.vacancies.notOpenedYet),
    ).toBeTruthy();
    expect(within(draft).queryByText(messages.vacancies.urgent)).toBeNull();
  });

  it('renders the same vacancies as cards with a link to the card', () => {
    mount(list({ items: [first] }));
    const cards = screen.getByRole('list', {
      name: messages.vacancies.caption,
    });
    expect(
      within(cards)
        .getByRole('link', { name: first.title })
        .getAttribute('href'),
    ).toBe(`/vacancies/${first.id}`);
    expect(within(cards).getByText(/V-0001 · Гемблінг/)).toBeTruthy();
    expect(within(cards).getByText(/Відкрита з 22\.10\.2026/)).toBeTruthy();
  });

  it('selects a preview row with the named button, marks it pressed, and ignores clicks on the title link', async () => {
    const onSelect = vi.fn();
    mount(
      list({
        items: [first, second],
        selectedId: second.id,
        wide: true,
        onSelect,
      }),
    );
    const label = (title: string) =>
      messages.vacancies.previewSelect.replace('{title}', title);
    expect(
      screen
        .getByRole('button', { name: label(second.title) })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    const firstButton = screen.getByRole('button', {
      name: label(first.title),
    });
    expect(firstButton.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(firstButton);
    expect(onSelect).toHaveBeenLastCalledWith(first.id);

    const table = screen.getByRole('table');
    onSelect.mockClear();
    await userEvent.click(
      within(table).getByRole('link', { name: second.title }),
    );
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(within(table).getByText('V-0001').closest('tr')!);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(first.id);
  });

  it('announces hover and keyboard intent on the preview button so the detail can be prefetched', async () => {
    const onPreviewIntent = vi.fn();
    mount(list({ items: [first, second], wide: true, onPreviewIntent }));
    const label = (title: string) =>
      messages.vacancies.previewSelect.replace('{title}', title);
    await userEvent.hover(
      screen.getByRole('button', { name: label(first.title) }),
    );
    expect(onPreviewIntent).toHaveBeenLastCalledWith(first.id);
    screen.getByRole('button', { name: label(second.title) }).focus();
    expect(onPreviewIntent).toHaveBeenLastCalledWith(second.id);
  });

  it('does not select by row click below the wide breakpoint', async () => {
    const onSelect = vi.fn();
    mount(list({ items: [first], selectedId: first.id, onSelect }));
    await userEvent.click(screen.getByText('V-0001').closest('tr')!);
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByRole('table').querySelector('[aria-pressed="true"]'),
    ).toBeNull();
  });
});

describe('urgent highlight [STORY-VAC-04-4, D97]', () => {
  const badge = () => screen.getByText(messages.vacancies.urgent);

  it.each(['OPEN', 'ON_HOLD', 'DRAFT'] as const)(
    'shows a %s urgent vacancy in the soft red tokens with the label',
    (status) => {
      mount(
        createElement(VacancyFlags, {
          vacancy: summary({ priority: 'URGENT', status }),
        }),
      );
      expect(badge().className).toContain('bg-destructive-subtle');
      expect(badge().className).toContain('text-error-text');
      expect(badge().className).not.toContain('warning');
    },
  );

  it.each(['FILLED', 'CANCELLED'] as const)(
    'keeps the label but drops the red for a %s urgent vacancy',
    (status) => {
      mount(
        createElement(VacancyFlags, {
          vacancy: summary({ priority: 'URGENT', status }),
        }),
      );
      expect(badge().className).toContain('bg-surface-muted');
      expect(badge().className).not.toContain('destructive');
      expect(badge().className).not.toContain('error-text');
    },
  );

  it('shows no urgency label for a normal vacancy', () => {
    mount(createElement(VacancyFlags, { vacancy: summary() }));
    expect(screen.queryByText(messages.vacancies.urgent)).toBeNull();
  });

  it('puts the red edge on the table row and the card of an open urgent vacancy only', () => {
    const open = summary({ priority: 'URGENT' });
    const closed = summary({
      id: crypto.randomUUID(),
      number: 'V-0002',
      title: 'Закрита',
      priority: 'URGENT',
      status: 'CANCELLED',
    });
    mount(
      createElement(VacanciesList, {
        items: [open, closed],
        selectedId: undefined,
        wide: false,
        onSelect: vi.fn(),
        onPreviewIntent: vi.fn(),
      }),
    );
    const edge = 'var(--destructive)';
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]!.className).toContain(edge);
    expect(rows[2]!.className).not.toContain(edge);
    const cards = within(
      screen.getByRole('list', { name: messages.vacancies.caption }),
    ).getAllByRole('listitem');
    expect(cards[0]!.className).toContain(edge);
    expect(cards[1]!.className).not.toContain(edge);
  });

  it('renders the same highlight in the preview and detail header', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ priority: 'URGENT' }),
        preview: true,
      }),
    );
    expect(badge().className).toContain('bg-destructive-subtle');
  });
});

describe('VacancyOverview [STORY-VAC-04-2, UI-09]', () => {
  it('shows real fields, formatted salary and honest placeholders', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ recruiters: [person('Оксана Кравець', false)] }),
      }),
    );
    expect(screen.getByText('V-0001')).toBeTruthy();
    expect(screen.getByText('Василь Петренко')).toBeTruthy();
    expect(screen.getByText(/Оксана Кравець/).textContent).toContain(
      messages.vacancies.inactive,
    );
    expect(screen.getByText(/1\s?500,00.*2\s?500,00/)).toBeTruthy();
    expect(screen.getByText('90 днів')).toBeTruthy();
    expect(screen.getByText('2 місця')).toBeTruthy();
    expect(
      screen.getAllByText(messages.vacancies.notSpecified).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(messages.vacancies.openCard)).toBeNull();
  });

  it('hides the opening date for a vacancy that never opened and offers the card link in the preview', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: detail({ openedAt: null, teamLead: null }),
        preview: true,
      }),
    );
    expect(screen.queryByText(messages.vacancies.fields.openedAt)).toBeNull();
    expect(screen.getAllByText(messages.vacancies.unassigned)).toHaveLength(2);
    expect(
      screen
        .getByRole('link', { name: messages.vacancies.openCard })
        .getAttribute('href'),
    ).toMatch(/^\/vacancies\//);
  });

  it('copies the absolute detail link and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const vacancy = detail();
    mount(createElement(VacancyOverview, { vacancy }));
    await userEvent.click(
      screen.getByRole('button', { name: messages.vacancies.share }),
    );
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/vacancies/${vacancy.id}`,
    );
    expect(toast.success).toHaveBeenCalledWith(messages.vacancies.shareCopied);
  });

  it('announces a copy failure and exposes the link to copy by hand', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const vacancy = detail();
    mount(createElement(VacancyOverview, { vacancy }));
    await userEvent.click(
      screen.getByRole('button', { name: messages.vacancies.share }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(messages.vacancies.shareFailed);
    expect(within(alert).getByRole('link').getAttribute('href')).toBe(
      `/vacancies/${vacancy.id}`,
    );
  });
});

describe('vacancy badges [UI foundation F2, design-system 1.6]', () => {
  const chip = (text: string) =>
    screen.getByText(text).closest<HTMLElement>('[data-slot="badge"]')!;

  it.each([
    ['DRAFT', 'border-dashed'],
    ['OPEN', 'bg-success-subtle'],
    ['ON_HOLD', 'bg-warning-subtle'],
    ['FILLED', 'bg-primary-subtle'],
    ['CANCELLED', 'bg-surface-muted'],
  ] as const)(
    'renders %s as a pill with a dot and its label',
    (status, marker) => {
      mount(createElement(VacancyStatus, { status }));
      const element = chip(messages.vacancies.status[status]);
      expect(element.className).toContain('rounded-full');
      expect(element.className).toContain(marker);
      expect(element.querySelector('[aria-hidden="true"]')).not.toBeNull();
    },
  );

  it('marks urgency with a flame and exposes the highlight state', () => {
    mount(
      createElement(VacancyFlags, {
        vacancy: summary({ priority: 'URGENT' }),
      }),
    );
    const element = chip(messages.vacancies.urgent);
    expect(element.getAttribute('data-urgent')).toBe('true');
    expect(element.querySelector('svg')).not.toBeNull();
  });

  it('shows the bot origin as a blue outline with the bot icon', () => {
    mount(
      createElement(VacancyFlags, {
        vacancy: summary({ source: 'TELEGRAM_BOT' }),
      }),
    );
    const element = chip(messages.vacancies.fromBot);
    expect(element.className).toContain('border-info');
    expect(element.className).toContain('text-info-text');
    expect(element.querySelector('svg')).not.toBeNull();
  });

  it('renders no badge for a normal vacancy created in the app', () => {
    mount(createElement(VacancyFlags, { vacancy: summary() }));
    expect(document.querySelector('[data-slot="badge"]')).toBeNull();
  });
});
