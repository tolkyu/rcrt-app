// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';
import {
  json,
  mountTeam,
  problem,
  stubApi,
  VERTICAL_ID,
  vacancy,
} from '../../support/team-harness';

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
      { href, 'data-prefetch': String(prefetch), ...props },
      children,
    ),
}));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast }));

const t = messages.vacancies.team;
const person = {
  id: crypto.randomUUID(),
  fullName: 'Оксана Кравець',
  isActive: true,
};
const row = (overrides: Partial<VacancySummary> = {}): VacancySummary => {
  const { id, number, title, vertical, status } = vacancy();
  return {
    id,
    number,
    title,
    vertical,
    position: null,
    teamLead: null,
    recruiters: [],
    status,
    priority: 'NORMAL',
    source: 'APP',
    openedAt: '2026-10-22T09:00:00.000Z',
    createdAt: '2026-10-18T09:00:00.000Z',
    updatedAt: '2026-10-22T09:00:00.000Z',
    ...overrides,
  };
};
const listNode = (
  items: VacancySummary[],
  verticals: string[] = [VERTICAL_ID],
) =>
  createElement(VacanciesList, {
    items,
    selectedId: undefined,
    wide: false,
    onSelect: vi.fn(),
    onPreviewIntent: vi.fn(),
    canAuthorDrafts: false,
    selfAssignVerticals: verticals,
    statusGrants: null,
  });
const list = (items: VacancySummary[], verticals?: string[]) =>
  mountTeam(listNode(items, verticals));
const table = () =>
  screen.getByRole('table', { name: messages.vacancies.caption });
const claimRow = (item: VacancySummary) =>
  within(table()).getByRole('button', {
    name: t.claimRowLabel
      .replace('{number}', item.number)
      .replace('{title}', item.title),
  });
const confirmClaim = async () => {
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: t.claimDialog.confirm }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('«Рекрутери» cell of the list [STORY-VAC-03-1, D130]', () => {
  it('shows the claim button only for a free OPEN row of a vertical the viewer may claim in', () => {
    const free = row();
    const staffed = row({ id: crypto.randomUUID(), recruiters: [person] });
    const paused = row({ id: crypto.randomUUID(), status: 'ON_HOLD' });
    list([free, staffed, paused]);
    expect(
      within(table()).getAllByRole('button', { name: /^Взяти вакансію V-/ }),
    ).toHaveLength(1);
    expect(claimRow(free).textContent).toBe(t.claimRow);
    // The mobile card carries its own full-width button, only for the free row.
    expect(screen.getAllByRole('button', { name: t.claim })).toHaveLength(1);
  });

  it.each([
    ['without the grant', [] as string[]],
    ['for another vertical', [crypto.randomUUID()]],
  ])('shows no button %s', (_name, verticals) => {
    list([row()], verticals);
    expect(screen.queryByRole('button', { name: /Взяти/ })).toBeNull();
  });

  it('marks unassigned OPEN and ON_HOLD rows, dashes a closed row, and counts avatars beyond three', () => {
    const open = row({ title: 'Відкрита' });
    const hold = row({
      id: crypto.randomUUID(),
      status: 'ON_HOLD',
      title: 'Пауза',
    });
    const closed = row({
      id: crypto.randomUUID(),
      status: 'FILLED',
      title: 'Закрита',
    });
    const many = row({
      id: crypto.randomUUID(),
      title: 'Команда',
      recruiters: Array.from({ length: 5 }, (_, index) => ({
        id: crypto.randomUUID(),
        fullName: `Рекрутер ${index + 1}`,
        isActive: true,
      })),
    });
    list([open, hold, closed, many], []);
    const cellOf = (title: string) =>
      within(within(table()).getByRole('link', { name: title }).closest('tr')!);
    for (const title of ['Відкрита', 'Пауза'])
      expect(
        cellOf(title).getAllByText(messages.vacancies.unassigned).length,
      ).toBeGreaterThan(1);
    expect(
      cellOf('Закрита').getByText(messages.vacancies.emptyValue),
    ).toBeTruthy();
    expect(cellOf('Команда').getByText('+2')).toBeTruthy();
    expect(
      cellOf('Команда').getByText(/Рекрутери: Рекрутер 1, Рекрутер 2/),
    ).toBeTruthy();
  });
});

describe('claim from a row', () => {
  it('confirms in a dialog, sends one claim, tells the user and moves focus to the cell', async () => {
    const item = row();
    const api = stubApi({
      [`POST /vacancies/${item.id}/recruiters/claim`]: () =>
        json(vacancy({ id: item.id, recruiters: [person], version: 2 })),
    });
    list([item]);
    const cell = claimRow(item).closest('[tabindex="-1"]');
    await userEvent.click(claimRow(item));
    await confirmClaim();
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith(
      t.claimDialog.done,
      expect.objectContaining({ id: `claim:${item.id}` }),
    );
    await waitFor(() => expect(document.activeElement).toBe(cell));
  });

  it('on a lost race warns and moves focus to the next row title, not to <body>', async () => {
    const first = row({ title: 'Перша' });
    const second = row({
      id: crypto.randomUUID(),
      title: 'Друга',
      status: 'ON_HOLD',
    });
    stubApi({
      [`POST /vacancies/${first.id}/recruiters/claim`]: () =>
        problem(409, 'VACANCY_ALREADY_ASSIGNED'),
    });
    list([first, second]);
    await userEvent.click(claimRow(first));
    await confirmClaim();
    expect(toast.warning).toHaveBeenCalledWith(
      t.claimDialog.lost,
      expect.objectContaining({ id: `claim:${first.id}` }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(table()).getByRole('link', { name: 'Друга' }),
      ),
    );
  });

  it('keeps focus on the next row when the list drops the claimed row before the dialog closes', async () => {
    const first = row({ title: 'Перша' });
    const second = row({
      id: crypto.randomUUID(),
      title: 'Друга',
      status: 'ON_HOLD',
    });
    const mounted: { view?: ReturnType<typeof list> } = {};
    stubApi({
      [`POST /vacancies/${first.id}/recruiters/claim`]: () => {
        // The refetch the loss triggers lands before the answer is handled.
        mounted.view?.update(listNode([second]));
        return problem(409, 'VACANCY_ALREADY_ASSIGNED');
      },
    });
    mounted.view = list([first, second]);
    await userEvent.click(claimRow(first));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.claimDialog.confirm }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(table()).getByRole('link', { name: 'Друга' }),
      ),
    );
  });

  it('names the avatar cell of a staffed row for the recruiter who just took it', async () => {
    const taken = row({ recruiters: [person] });
    list([taken]);
    const cell = within(table()).getByRole('group', { name: t.ownRow });
    expect(cell.getAttribute('tabindex')).toBe('-1');
  });

  it('opens the same confirm from the mobile card button, and Esc leaves focus on it', async () => {
    stubApi({});
    list([row()]);
    const button = screen.getByRole('button', { name: t.claim });
    await userEvent.click(button);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
