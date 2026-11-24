// @vitest-environment jsdom
import { useQuery } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import { StatusRowMenu } from '@/components/vacancies/status-row-menu';
import { queryKeys } from '@/lib/query-keys';
import type {
  VacancyDetail,
  VacancyPage,
  VacancySummary,
} from '@/lib/schemas/vacancy';
import { rowStatusActions } from '@/lib/vacancy-status-menu';
import { statusGrantMirror } from '@/server/authz/vacancy-status';
import messages from '@/messages/uk.json';
import { GAMBLING, ME, roleContext } from '../authz/fixtures';
import {
  ID,
  json,
  mountTeam,
  problem,
  stubApi,
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

const t = messages.vacancies.statusMenu;
const tTeam = messages.vacancies.team;
const PUT = `PUT /vacancies/${ID}/status`;
const GET_CARD = `GET /vacancies/${ID}`;
const OTHER_ID = crypto.randomUUID();
const LIST = queryKeys.vacancies({});
const GAMBLING_ROW = { id: GAMBLING, name: 'Гемблінг' };
const ADMIN = statusGrantMirror(roleContext('ADMIN'));
const TEAM_LEAD = statusGrantMirror(roleContext('TEAM_LEAD'));

/** The neighbour row has a menu too, so every query names the row under test. */
const MENU = `Дії: ${vacancy().title}`;
const summaryOf = (card: VacancyDetail): VacancySummary => ({
  id: card.id,
  number: card.number,
  title: card.title,
  vertical: card.vertical,
  position: card.position,
  teamLead: card.teamLead,
  recruiters: card.recruiters,
  status: card.status,
  priority: card.priority,
  source: card.source,
  openedAt: card.openedAt,
  createdAt: card.createdAt,
  updatedAt: card.updatedAt,
});
const card = (changes: Partial<VacancyDetail> = {}) =>
  vacancy({ version: 3, ...changes });
const paused = (changes: Partial<VacancyDetail> = {}) =>
  card({ status: 'ON_HOLD', version: 4, ...changes });
const filled = (changes: Partial<VacancyDetail> = {}) =>
  card({ status: 'FILLED', headcount: 2, version: 5, ...changes });
const cancelled = (changes: Partial<VacancyDetail> = {}) =>
  card({ status: 'CANCELLED', version: 4, ...changes });
const neighbour = (): VacancySummary => ({
  ...summaryOf(card()),
  id: OTHER_ID,
  number: 'V-0006',
  title: 'Наступна вакансія',
});

/** The rows read the list from the cache, like the real page, so an optimistic flip reaches the menu and a status filter drops the row. */
function Rows({
  mirror,
  filter,
}: {
  mirror: typeof ADMIN;
  filter?: VacancySummary['status'];
}) {
  const { data } = useQuery<VacancyPage>({
    queryKey: LIST,
    queryFn: () => Promise.reject(new Error('the list is read through stubs')),
    enabled: false,
  });
  const rows = (data?.items ?? []).filter(
    (row) => !filter || row.status === filter,
  );
  return createElement(
    'section',
    { 'data-slot': 'filter-bar-results', tabIndex: -1 },
    createElement(
      'ul',
      null,
      rows.map((row) =>
        createElement(
          'li',
          { key: row.id },
          createElement(
            'a',
            { href: `/vacancies/${row.id}`, 'data-vacancy-link': row.id },
            row.title,
          ),
          createElement(StatusRowMenu, {
            vacancy: row,
            actions: rowStatusActions(row, mirror),
          }),
        ),
      ),
    ),
  );
}

function mount(
  subject: VacancyDetail,
  options: {
    mirror?: typeof ADMIN;
    filter?: VacancySummary['status'];
    cached?: boolean;
    rows?: VacancySummary[];
  } = {},
) {
  const view = mountTeam(
    createElement(Rows, {
      mirror: options.mirror === undefined ? ADMIN : options.mirror,
      filter: options.filter,
    }),
  );
  view.queryClient.setQueryData(LIST, {
    items: [summaryOf(subject), ...(options.rows ?? [neighbour()])],
    nextCursor: null,
    prevCursor: null,
  });
  if (options.cached)
    view.queryClient.setQueryData(queryKeys.vacancy(ID), subject);
  return view;
}

const menuButton = () => screen.findByRole('button', { name: MENU });
const items = async () =>
  (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
const openMenu = async () => {
  (await menuButton()).focus();
  await userEvent.keyboard('{Enter}');
};
const press = async (name: string) => {
  await openMenu();
  await userEvent.click(await screen.findByRole('menuitem', { name }));
};
const gone = () =>
  waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
const link = (id: string) =>
  document.querySelector<HTMLElement>(`[data-vacancy-link="${id}"]`);
const puts = (calls: { method: string; body: unknown }[]) =>
  calls.filter((call) => call.method === 'PUT');
/** The press joins the hover's read instead of starting its own. */
const readsBeforeWrite = (calls: { method: string }[]) =>
  calls
    .slice(
      0,
      calls.findIndex((call) => call.method === 'PUT'),
    )
    .filter((call) => call.method === 'GET').length;
const held = <T>(answer: () => T) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, route: () => gate.then(answer) };
};

/** The lazy chunks load once here, so the first render's `findBy` waits for React, not for a cold module transform. */
beforeAll(() =>
  Promise.all([
    import('@/components/vacancies/status-row-actions'),
    import('@/components/vacancies/cancel-vacancy-dialog'),
    import('@/components/vacancies/reopen-vacancy-dialog'),
  ]),
);
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('row items come from the list data [STORY-VAC-02-1, D130(4)(5)]', () => {
  it.each([
    ['OPEN', card(), [t.hold, t.cancel]],
    ['ON_HOLD', paused(), [t.resume, t.cancel]],
    ['FILLED', filled(), [t.reopen]],
  ] as const)('Admin on %s', async (_status, subject, labels) => {
    const api = stubApi({});
    mount(subject);
    // Nothing is read before the pointer or focus reaches the `⋯`.
    expect(api.calls).toHaveLength(0);
    await openMenu();
    expect(await items()).toEqual(labels);
  });

  it.each([
    ['CANCELLED', cancelled()],
    ['DRAFT', card({ status: 'DRAFT' })],
  ] as const)('a %s row has no menu', (_status, subject) => {
    stubApi({});
    mount(subject);
    expect(screen.queryByRole('button', { name: MENU })).toBeNull();
  });

  it('the chunk and the menu are not mounted for a viewer without a grant', () => {
    stubApi({});
    mount(card(), { mirror: null });
    expect(screen.queryByRole('button', { name: MENU })).toBeNull();
  });

  it('a Team Lead sees items on the row he leads, and none on another row or on a closed one', async () => {
    const lead = { id: ME, fullName: 'Василь', isActive: true };
    stubApi({});
    mount(card({ teamLead: lead, vertical: GAMBLING_ROW }), {
      mirror: TEAM_LEAD,
    });
    await openMenu();
    expect(await items()).toEqual([t.hold, t.cancel]);
    cleanup();
    mount(card({ teamLead: null, vertical: GAMBLING_ROW }), {
      mirror: TEAM_LEAD,
    });
    expect(screen.queryByRole('button', { name: MENU })).toBeNull();
    cleanup();
    mount(filled({ teamLead: lead, vertical: GAMBLING_ROW }), {
      mirror: TEAM_LEAD,
    });
    expect(screen.queryByRole('button', { name: MENU })).toBeNull();
  });
});

describe('the card version: prefetch and an instant press [D130(5)]', () => {
  it('reads the card once on hover, and not again while it is fresh', async () => {
    const api = stubApi({ [GET_CARD]: () => json(card()) });
    mount(card());
    const trigger = await menuButton();
    await userEvent.hover(trigger);
    await waitFor(() => expect(api.calls).toHaveLength(1));
    await userEvent.unhover(trigger);
    await userEvent.hover(trigger);
    expect(api.calls).toHaveLength(1);
  });

  it('a card already in the cache means no read at all: pause sends the version it holds', async () => {
    const api = stubApi({ [PUT]: () => json(paused({ version: 4 })) });
    mount(card(), { cached: true });
    await press(t.hold);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    // The write is the first request: nothing was read before it.
    expect(api.calls[0]?.method).toBe('PUT');
    expect(api.calls[0]?.body).toEqual({ action: 'HOLD', expectedVersion: 3 });
    expect(toast.success).toHaveBeenCalledWith(
      t.toast.held,
      expect.objectContaining({ id: `status:${ID}` }),
    );
  });

  it('a press before the version arrives waits inside the open menu and then runs', async () => {
    const gate = held(() => json(card()));
    const api = stubApi({
      [GET_CARD]: gate.route,
      [PUT]: () => json(paused({ version: 4 })),
    });
    mount(card());
    await openMenu();
    const item = await screen.findByRole('menuitem', { name: t.hold });
    await userEvent.click(item);
    await waitFor(() => expect(item.getAttribute('aria-busy')).toBe('true'));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(puts(api.calls)).toHaveLength(0);
    gate.release();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(puts(api.calls)).toHaveLength(1);
    expect(readsBeforeWrite(api.calls)).toBe(1);
  });

  it('a second press while it waits changes nothing: one read, one write', async () => {
    const gate = held(() => json(card()));
    const api = stubApi({
      [GET_CARD]: gate.route,
      [PUT]: () => json(paused({ version: 4 })),
    });
    mount(card());
    await openMenu();
    const item = await screen.findByRole('menuitem', { name: t.hold });
    await userEvent.dblClick(item);
    gate.release();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(readsBeforeWrite(api.calls)).toBe(1);
    expect(puts(api.calls)).toHaveLength(1);
  });

  it('Esc while it waits withdraws the press: the version arrives and nothing is written', async () => {
    const gate = held(() => json(card()));
    const api = stubApi({
      [GET_CARD]: gate.route,
      [PUT]: () => json(paused({ version: 4 })),
    });
    mount(card());
    await openMenu();
    const item = await screen.findByRole('menuitem', { name: t.hold });
    await userEvent.click(item);
    await waitFor(() => expect(item.getAttribute('aria-busy')).toBe('true'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    gate.release();
    await waitFor(() =>
      expect(api.calls.filter((call) => call.method === 'GET')).toHaveLength(1),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(puts(api.calls)).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('pressing another item while one waits switches the wait to it: the last press runs, once', async () => {
    const gate = held(() => json(card()));
    const api = stubApi({
      [GET_CARD]: gate.route,
      [PUT]: () => json(paused({ version: 4 })),
    });
    mount(card());
    await openMenu();
    const hold = await screen.findByRole('menuitem', { name: t.hold });
    await userEvent.click(hold);
    await waitFor(() => expect(hold.getAttribute('aria-busy')).toBe('true'));
    const cancel = screen.getByRole('menuitem', { name: t.cancel });
    await userEvent.click(cancel);
    await waitFor(() => expect(cancel.getAttribute('aria-busy')).toBe('true'));
    expect(hold.hasAttribute('aria-busy')).toBe(false);
    gate.release();
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(puts(api.calls)).toHaveLength(0);
  });

  it.each([
    [404, 'NOT_FOUND', tTeam.toast.gone],
    [403, 'FORBIDDEN', tTeam.toast.forbidden],
  ] as const)(
    'a read answered %s ends in its toast, writes nothing and frees the item',
    async (status, code, text) => {
      const api = stubApi({ [GET_CARD]: () => problem(status, code) });
      mount(card());
      await press(t.hold);
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(text, expect.anything()),
      );
      expect(puts(api.calls)).toHaveLength(0);
      await openMenu();
      expect(
        (await screen.findByRole('menuitem', { name: t.hold })).hasAttribute(
          'aria-busy',
        ),
      ).toBe(false);
    },
  );

  it('a lost connection offers the retry, which reads again and then writes', async () => {
    let online = false;
    const api = stubApi({
      [GET_CARD]: () =>
        online ? json(card()) : Promise.reject(new TypeError('offline')),
      [PUT]: () => json(paused({ version: 4 })),
    });
    mount(card());
    await press(t.hold);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        t.toast.noConnection,
        expect.objectContaining({
          description: t.toast.noConnectionDescription,
          action: expect.objectContaining({ label: t.toast.retry }),
        }),
      ),
    );
    expect(puts(api.calls)).toHaveLength(0);
    const [, options] = toast.error.mock.calls[0] as [
      string,
      { action: { onAction: () => void } },
    ];
    online = true;
    options.action.onAction();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(puts(api.calls)).toHaveLength(1);
  });

  it('a write that fails after the read rolls the row back with the shared toast', async () => {
    stubApi({
      [PUT]: () => problem(500, 'INTERNAL'),
      [GET_CARD]: () => json(card()),
    });
    mount(card(), { cached: true });
    await press(t.hold);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        t.toast.failed,
        expect.objectContaining({ description: t.toast.failedDescription }),
      ),
    );
    await openMenu();
    expect(await items()).toEqual([t.hold, t.cancel]);
  });
});

describe('the dialogs are the card dialogs [D130(4)]', () => {
  it('«Скасувати вакансію…» opens the confirm with the card’s data, sends the reason once, and focus goes to the row title', async () => {
    const api = stubApi({
      [PUT]: () => json({ ...cancelled(), cancelReason: 'Бюджет' }),
    });
    mount(card(), { cached: true });
    await press(t.cancel);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Бюджет');
    await userEvent.dblClick(
      within(dialog).getByRole('button', { name: t.cancelDialog.confirm }),
    );
    await gone();
    expect(puts(api.calls)).toHaveLength(1);
    expect(puts(api.calls)[0]?.body).toEqual({
      action: 'CANCEL',
      reason: 'Бюджет',
      expectedVersion: 3,
    });
    expect(toast.success).toHaveBeenCalledWith(
      t.cancelDialog.done,
      expect.anything(),
    );
    await waitFor(() => expect(document.activeElement).toBe(link(ID)));
  });

  it('Esc writes nothing and focus returns to the row «⋯»', async () => {
    const api = stubApi({});
    mount(card(), { cached: true });
    await press(t.cancel);
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await gone();
    expect(api.calls).toHaveLength(0);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: MENU }),
      ),
    );
  });

  it('«Відкрити знову» waits for the version, then opens the headcount dialog; success returns focus to «⋯»', async () => {
    const gate = held(() => json(filled()));
    const api = stubApi({
      [GET_CARD]: gate.route,
      [PUT]: () => json(card({ version: 6, headcount: 2 })),
    });
    mount(filled());
    await openMenu();
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t.reopen }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    gate.release();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.reopenDialog.confirm }),
    );
    await gone();
    expect(puts(api.calls)[0]?.body).toEqual({
      action: 'REOPEN',
      expectedVersion: 5,
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: MENU }),
      ),
    );
  });

  it('a stale version stays inside the dialog like on the card', async () => {
    stubApi({
      [PUT]: () => problem(409, 'STALE_STATE'),
      [GET_CARD]: () => json(card({ version: 6 })),
    });
    mount(card(), { cached: true });
    await press(t.cancel);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Причина');
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.cancelDialog.confirm }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(t.stale);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});

describe('focus when the row leaves the list [D130(5)]', () => {
  it('pause in an «Відкриті» list drops the row and focus goes to the next row', async () => {
    stubApi({ [PUT]: () => json(paused({ version: 4 })) });
    mount(card(), { cached: true, filter: 'OPEN' });
    await menuButton();
    expect(link(OTHER_ID)).toBeTruthy();
    await press(t.hold);
    await waitFor(() => expect(link(ID)).toBeNull());
    expect(document.activeElement).toBe(link(OTHER_ID));
  });

  it('the last row hands focus to the results region', async () => {
    stubApi({ [PUT]: () => json(paused({ version: 4 })) });
    mount(card(), { cached: true, filter: 'OPEN', rows: [] });
    await press(t.hold);
    await waitFor(() => expect(link(ID)).toBeNull());
    expect(document.activeElement).toBe(
      document.querySelector('[data-slot="filter-bar-results"]'),
    );
  });

  it('a row that stays keeps focus on its «⋯» after an at-once action', async () => {
    stubApi({ [PUT]: () => json(paused({ version: 4 })) });
    mount(card(), { cached: true });
    await press(t.hold);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: MENU }),
      ),
    );
  });
});

describe('the list wires the menu into both layouts [D130(5)]', () => {
  const list = (mirror: typeof ADMIN, onSelect = vi.fn()) =>
    mountTeam(
      createElement(VacanciesList, {
        items: [summaryOf(card())],
        selectedId: undefined,
        wide: true,
        onSelect,
        onPreviewIntent: vi.fn(),
        canAuthorDrafts: false,
        selfAssignVerticals: [],
        statusGrants: mirror,
      }),
    );

  it('a viewer with status grants gets a menu in the table row and on the mobile card, and the table keeps its menu column below xl', async () => {
    stubApi({});
    list(ADMIN);
    expect(await screen.findAllByRole('button', { name: MENU })).toHaveLength(
      2,
    );
    const head = screen.getAllByRole('columnheader').at(-1);
    expect(head?.className).not.toContain('hidden');
    // The mobile title leaves room for the menu.
    const titles = screen.getAllByRole('link', { name: vacancy().title });
    expect(titles.at(-1)?.className).toContain('pr-11');
  });

  it('pressing «⋯» does not select the row', async () => {
    stubApi({});
    const onSelect = vi.fn();
    list(ADMIN, onSelect);
    const [trigger] = await screen.findAllByRole('button', { name: MENU });
    await userEvent.click(trigger as HTMLElement);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a viewer without grants gets no menu and the old hidden column', () => {
    stubApi({});
    list(null);
    expect(screen.queryByRole('button', { name: MENU })).toBeNull();
    expect(screen.getAllByRole('columnheader').at(-1)?.className).toContain(
      'hidden',
    );
  });
});
