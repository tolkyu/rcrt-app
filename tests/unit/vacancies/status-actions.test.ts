// @vitest-environment jsdom
import { QueryClient, useQuery } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHeaderActions } from '@/components/vacancies/status-header-actions';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import messages from '@/messages/uk.json';
import {
  ID,
  json,
  mountTeam,
  problem,
  stubApi,
  vacancy,
} from '../../support/team-harness';

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

const open = (changes: Partial<VacancyDetail> = {}) =>
  vacancy({ statusActions: ['HOLD', 'CANCEL'], version: 3, ...changes });
const paused = (changes: Partial<VacancyDetail> = {}) =>
  vacancy({
    status: 'ON_HOLD',
    statusActions: ['RESUME', 'CANCEL'],
    version: 4,
    ...changes,
  });
const filled = (changes: Partial<VacancyDetail> = {}) =>
  vacancy({
    status: 'FILLED',
    statusActions: ['REOPEN'],
    headcount: 2,
    version: 5,
    ...changes,
  });
const cancelled = (changes: Partial<VacancyDetail> = {}) =>
  vacancy({ status: 'CANCELLED', statusActions: [], version: 4, ...changes });

/** The header reads the card from the cache, like the real page, so an optimistic flip reaches the buttons. */
function Live({
  initial,
  preview,
}: {
  initial: VacancyDetail;
  preview: boolean;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.vacancy(ID),
    queryFn: () => Promise.reject(new Error('the card is read through stubs')),
    enabled: false,
    initialData: initial,
  });
  const header = createElement(StatusHeaderActions, {
    vacancy: data,
    preview,
  });
  return preview
    ? createElement(
        'div',
        { 'data-slot': 'detail-header' },
        createElement('h2', null, data.title),
        header,
      )
    : createElement(
        'main',
        { id: 'main' },
        createElement('h1', null, data.title),
        header,
      );
}

const mount = (initial: VacancyDetail, preview = false) =>
  mountTeam(createElement(Live, { initial, preview }));
const button = (name: string) => screen.findByRole('button', { name });
const menuButton = () => screen.findByRole('button', { name: /^Дії:/ });
const gone = () =>
  waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
const cardOf = (client: QueryClient) =>
  client.getQueryData<VacancyDetail>(queryKeys.vacancy(ID));
const openMenu = async () => {
  (await menuButton()).focus();
  await userEvent.keyboard('{Enter}');
};
/** Opens the `⋯` menu from the keyboard, the path that needs no pointer capture. */
async function pick(name: string) {
  await openMenu();
  await userEvent.click(await screen.findByRole('menuitem', { name }));
}
const versionsSent = (calls: { method: string; body: unknown }[]) =>
  calls
    .filter((call) => call.method === 'PUT')
    .map((call) => (call.body as { expectedVersion: number }).expectedVersion);

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('status controls come from the server flags [STORY-VAC-02-1, D130]', () => {
  it('renders nothing for a viewer without a status action', () => {
    stubApi({});
    mount(open({ statusActions: [] }));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    ['OPEN', open(), t.hold],
    ['ON_HOLD', paused(), t.resume],
  ] as const)(
    '%s: one outline button and the cancel item in «⋯»',
    async (_status, card, label) => {
      stubApi({});
      mount(card);
      expect(await button(label)).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.reopen })).toBeNull();
      await openMenu();
      const items = await screen.findAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual([t.cancel]);
    },
  );

  it('FILLED: the primary «Відкрити знову», no menu', async () => {
    stubApi({});
    mount(filled());
    expect(await button(t.reopen)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Дії:/ })).toBeNull();
  });

  it('the preview has no buttons: pause and cancel are items of its menu', async () => {
    stubApi({});
    mount(open(), true);
    await menuButton();
    expect(screen.queryByRole('button', { name: t.hold })).toBeNull();
    await openMenu();
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([t.hold, t.cancel]);
  });

  it('keeps its dialog host when the vacancy loses every action', async () => {
    stubApi({});
    const { queryClient } = mount(open());
    await button(t.hold);
    queryClient.setQueryData(queryKeys.vacancy(ID), cancelled());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: t.hold })).toBeNull(),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('pause and resume: optimistic, with rollback [STORY-VAC-02-1, D130]', () => {
  /** A PUT that stays open until the test lets it answer, so the optimistic state can be looked at. */
  const held = (answer: () => Response) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { release, route: () => gate.then(answer) };
  };

  it('flips the button at once, sends the version it saw, and announces on the answer', async () => {
    const gate = held(() => json(paused({ version: 4 })));
    const api = stubApi({ [PUT]: gate.route });
    const { queryClient } = mount(open());
    await userEvent.click(await button(t.hold));
    expect(await button(t.resume)).toBeTruthy();
    expect(cardOf(queryClient)?.status).toBe('ON_HOLD');
    expect(toast.success).not.toHaveBeenCalled();
    gate.release();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        t.toast.held,
        expect.objectContaining({
          description: t.toast.heldFree.replace('{number}', 'V-0005'),
          id: `status:${ID}`,
          duration: 3000,
        }),
      ),
    );
    expect(api.calls[0]?.body).toEqual({ action: 'HOLD', expectedVersion: 3 });
    expect(cardOf(queryClient)?.version).toBe(4);
  });

  it('a vacancy with a recruiter has no «free» line; resume tells the new status', async () => {
    const recruiter = {
      id: crypto.randomUUID(),
      fullName: 'Оксана Кравець',
      isActive: true,
    };
    stubApi({
      [PUT]: () => json(open({ version: 5, recruiters: [recruiter] })),
    });
    mount(paused({ recruiters: [recruiter] }));
    await userEvent.click(await button(t.resume));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        t.toast.resumed,
        expect.objectContaining({ description: 'V-0005 · Відкрита' }),
      ),
    );
  });

  it('a double press sends one request', async () => {
    const gate = held(() => json(paused({ version: 4 })));
    const api = stubApi({ [PUT]: gate.route });
    mount(open());
    await userEvent.dblClick(await button(t.hold));
    gate.release();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  });

  it('marks the button busy while the request runs', async () => {
    const gate = held(() => json(paused({ version: 4 })));
    stubApi({ [PUT]: gate.route });
    mount(open());
    await userEvent.click(await button(t.hold));
    expect((await button(t.resume)).getAttribute('aria-busy')).toBe('true');
    gate.release();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect((await button(t.resume)).hasAttribute('aria-busy')).toBe(false);
  });

  it('a repeat that another tab already did changes nothing and says nothing', async () => {
    stubApi({ [PUT]: () => json(paused({ version: 3 })) });
    mount(open());
    await userEvent.click(await button(t.hold));
    await button(t.resume);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('rolls back on a server error and the toast button sends it again at the fresh version', async () => {
    let attempt = 0;
    const api = stubApi({
      [PUT]: () =>
        ++attempt === 1
          ? problem(500, 'INTERNAL')
          : json(paused({ version: 5 })),
      [GET_CARD]: () => json(open({ version: 4 })),
    });
    const { queryClient } = mount(open());
    await userEvent.click(await button(t.hold));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const [title, options] = toast.error.mock.calls[0] as [
      string,
      { description: string; action: { onAction: () => void } },
    ];
    expect(title).toBe(t.toast.failed);
    expect(options.description).toBe(t.toast.failedDescription);
    expect(await button(t.hold)).toBeTruthy();
    expect(cardOf(queryClient)?.status).toBe('OPEN');
    options.action.onAction();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(versionsSent(api.calls)).toEqual([3, 4]);
  });

  it('a lost connection rolls back and offers the retry', async () => {
    stubApi({ [PUT]: () => Promise.reject(new TypeError('offline')) });
    mount(open());
    await userEvent.click(await button(t.hold));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        t.toast.noConnection,
        expect.objectContaining({
          description: t.toast.noConnectionDescription,
          action: expect.objectContaining({ label: t.toast.retry }),
        }),
      ),
    );
    expect(await button(t.hold)).toBeTruthy();
  });

  it('a stale version names the status the server has now, and puts the button back', async () => {
    stubApi({
      [PUT]: () => problem(409, 'STALE_STATE'),
      [GET_CARD]: () => json(cancelled()),
    });
    mount(open());
    await userEvent.click(await button(t.hold));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        t.toast.stale,
        expect.objectContaining({
          description: t.toast.staleDescription.replace('{value}', 'Скасована'),
          id: `stale:vacancy:${ID}`,
        }),
      ),
    );
  });

  it('a stale answer that is our own earlier write (lost response) counts as done', async () => {
    stubApi({
      [PUT]: () => problem(409, 'STALE_STATE'),
      [GET_CARD]: () => json(paused({ version: 4 })),
    });
    mount(open());
    await userEvent.click(await button(t.hold));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('an illegal pair (VACANCY_STATUS_INVALID) is a warning, not a failure', async () => {
    stubApi({
      [PUT]: () => problem(409, 'VACANCY_STATUS_INVALID'),
      [GET_CARD]: () => json(filled()),
    });
    mount(open());
    await userEvent.click(await button(t.hold));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        t.toast.stale,
        expect.objectContaining({
          description: t.toast.staleDescription.replace('{value}', 'Заповнена'),
        }),
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'FORBIDDEN', tTeam.toast.forbidden, 'error'],
    [404, 'NOT_FOUND', tTeam.toast.gone, 'error'],
    [429, 'RATE_LIMITED', tTeam.toast.rateLimited, 'warning'],
  ] as const)(
    '%s rolls back with its own toast',
    async (status, code, text, tone) => {
      stubApi({
        [PUT]: () => problem(status, code),
        [GET_CARD]: () => problem(404, 'NOT_FOUND'),
      });
      mount(open());
      await userEvent.click(await button(t.hold));
      await waitFor(() =>
        expect(toast[tone]).toHaveBeenCalledWith(text, expect.anything()),
      );
      expect(await button(t.hold)).toBeTruthy();
    },
  );

  it('works from the preview menu too', async () => {
    const api = stubApi({ [PUT]: () => json(paused({ version: 4 })) });
    mount(open(), true);
    await pick(t.hold);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(api.calls[0]?.body).toEqual({ action: 'HOLD', expectedVersion: 3 });
  });
});

describe('cancel [STORY-VAC-02-1, D130(4), D113]', () => {
  const confirmName = t.cancelDialog.confirm;
  const openDialog = async () => {
    await pick(t.cancel);
    return screen.findByRole('alertdialog');
  };
  const typeReason = (dialog: HTMLElement, text: string) =>
    userEvent.type(within(dialog).getByRole('textbox'), text);
  const confirm = (dialog: HTMLElement) =>
    within(dialog).getByRole('button', { name: confirmName });

  it('opens on the safe button and blocks the destructive one until a reason is typed', async () => {
    const api = stubApi({});
    mount(open());
    const dialog = await openDialog();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: t.cancelDialog.keep }),
    );
    expect(confirm(dialog).getAttribute('aria-disabled')).toBe('true');
    expect(
      within(dialog).getByText(messages.common.confirmReasonRequired),
    ).toBeTruthy();
    await userEvent.click(confirm(dialog));
    expect(api.calls).toHaveLength(0);
  });

  it('sends the reason once with the version it opened on, then moves focus to the title', async () => {
    const api = stubApi({
      [PUT]: () => json({ ...cancelled(), cancelReason: 'Бюджет заморожено' }),
    });
    const { queryClient } = mount(open());
    const dialog = await openDialog();
    await typeReason(dialog, '  Бюджет заморожено ');
    await userEvent.dblClick(confirm(dialog));
    await gone();
    const puts = api.calls.filter((call) => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({
      action: 'CANCEL',
      reason: 'Бюджет заморожено',
      expectedVersion: 3,
    });
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      t.cancelDialog.done,
      expect.objectContaining({
        description: t.cancelDialog.doneDescription.replace(
          '{number}',
          'V-0005',
        ),
        id: `status:${ID}`,
      }),
    );
    expect(cardOf(queryClient)?.status).toBe('CANCELLED');
    // The «⋯» item that opened the dialog is gone: focus goes to the title, never <body>.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1 }),
      ),
    );
  });

  it('in the preview focus goes to the panel title', async () => {
    stubApi({ [PUT]: () => json(cancelled()) });
    mount(open(), true);
    const dialog = await openDialog();
    await typeReason(dialog, 'Причина');
    await userEvent.click(confirm(dialog));
    await gone();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 2 }),
      ),
    );
  });

  it('Esc writes nothing', async () => {
    const api = stubApi({});
    mount(open());
    const dialog = await openDialog();
    await typeReason(dialog, 'Причина');
    await userEvent.keyboard('{Escape}');
    await gone();
    expect(api.calls).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('refuses a reason with invisible characters before it reaches the server', async () => {
    const api = stubApi({});
    mount(open());
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('textbox'));
    await userEvent.paste('Причина​');
    await userEvent.click(confirm(dialog));
    expect((await screen.findByRole('alert')).textContent).toContain(
      messages.vacancies.draft.close.error.invalid,
    );
    expect(api.calls).toHaveLength(0);
  });

  it('a stale version keeps the dialog and the reason, and the next confirm carries the version the refetch brought', async () => {
    let attempt = 0;
    const api = stubApi({
      [PUT]: () =>
        ++attempt === 1 ? problem(409, 'STALE_STATE') : json(cancelled()),
      [GET_CARD]: () => json(open({ version: 6 })),
    });
    mount(open());
    const dialog = await openDialog();
    await typeReason(dialog, 'Причина');
    await userEvent.click(confirm(dialog));
    expect((await screen.findByRole('alert')).textContent).toContain(t.stale);
    expect(within(dialog).getByRole('textbox')).toHaveProperty(
      'value',
      'Причина',
    );
    await userEvent.click(confirm(dialog));
    await gone();
    expect(versionsSent(api.calls)).toEqual([3, 6]);
  });

  it('a vacancy closed meanwhile is explained inside the dialog', async () => {
    stubApi({
      [PUT]: () => problem(409, 'VACANCY_STATUS_INVALID'),
      [GET_CARD]: () => json(filled()),
    });
    mount(open());
    const dialog = await openDialog();
    await typeReason(dialog, 'Причина');
    await userEvent.click(confirm(dialog));
    expect((await screen.findByRole('alert')).textContent).toContain(
      messages.vacancies.teamConflicts.VACANCY_STATUS_INVALID,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('a lost connection keeps the dialog and the reason; the retry sends the same request', async () => {
    let attempt = 0;
    const api = stubApi({
      [PUT]: () =>
        ++attempt === 1
          ? Promise.reject(new TypeError('offline'))
          : json(cancelled()),
    });
    mount(open());
    const dialog = await openDialog();
    await typeReason(dialog, 'Причина');
    await userEvent.click(confirm(dialog));
    expect((await screen.findByRole('alert')).textContent).toContain(
      tTeam.noConnection,
    );
    await userEvent.click(confirm(dialog));
    await gone();
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(2);
  });

  it.each([
    [404, 'NOT_FOUND', tTeam.toast.gone, 'error', true],
    [403, 'FORBIDDEN', tTeam.toast.forbidden, 'error', true],
    [429, 'RATE_LIMITED', tTeam.toast.rateLimited, 'warning', false],
  ] as const)(
    '%s → toast, dialog closes: %s',
    async (status, code, text, tone, closes) => {
      stubApi({
        [PUT]: () => problem(status, code),
        [GET_CARD]: () => problem(404, 'NOT_FOUND'),
      });
      mount(open());
      const dialog = await openDialog();
      await typeReason(dialog, 'Причина');
      await userEvent.click(confirm(dialog));
      await waitFor(() =>
        expect(toast[tone]).toHaveBeenCalledWith(text, expect.anything()),
      );
      if (closes) await gone();
      else expect(screen.getByRole('alertdialog')).toBeTruthy();
    },
  );
});

describe('reopen [STORY-VAC-02-1, D130(4)]', () => {
  const openDialog = async () => {
    await userEvent.click(await button(t.reopen));
    return screen.findByRole('dialog');
  };
  const field = (dialog: HTMLElement) =>
    within(dialog).getByRole('textbox', {
      name: t.reopenDialog.headcount,
    }) as HTMLInputElement;
  const confirm = (dialog: HTMLElement) =>
    within(dialog).getByRole('button', { name: t.reopenDialog.confirm });

  it('opens on the number, prefilled and selected; an unchanged number sends no headcount', async () => {
    const api = stubApi({
      [PUT]: () => json(open({ version: 6, headcount: 2 })),
    });
    const { queryClient } = mount(filled());
    const dialog = await openDialog();
    const input = field(dialog);
    expect(input.value).toBe('2');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(1);
    await userEvent.click(confirm(dialog));
    await gone();
    expect(api.calls[0]?.body).toEqual({
      action: 'REOPEN',
      expectedVersion: 5,
    });
    expect(toast.success).toHaveBeenCalledWith(
      t.reopenDialog.done,
      expect.objectContaining({ description: 'V-0005 · Відкрита' }),
    );
    expect(cardOf(queryClient)?.status).toBe('OPEN');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1 }),
      ),
    );
  });

  it('Enter confirms; the stepper changes the number and the toast shows the change', async () => {
    const api = stubApi({
      [PUT]: () => json(open({ version: 6, headcount: 3 })),
    });
    mount(filled());
    const dialog = await openDialog();
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.reopenDialog.increase }),
    );
    expect(field(dialog).value).toBe('3');
    field(dialog).focus();
    await userEvent.keyboard('{Enter}');
    await gone();
    expect(api.calls[0]?.body).toEqual({
      action: 'REOPEN',
      expectedVersion: 5,
      headcount: 3,
    });
    expect(toast.success).toHaveBeenCalledWith(
      t.reopenDialog.done,
      expect.objectContaining({
        description: 'V-0005 · Відкрита · Місць: 2 → 3',
      }),
    );
  });

  it('the stepper stops at 1 and at 100', async () => {
    stubApi({});
    mount(filled({ headcount: 1 }));
    const dialog = await openDialog();
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.reopenDialog.decrease }),
    );
    expect(field(dialog).value).toBe('1');
    await userEvent.clear(field(dialog));
    await userEvent.type(field(dialog), '100');
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.reopenDialog.increase }),
    );
    expect(field(dialog).value).toBe('100');
  });

  it.each(['', '0', '101', 'два', '2.5'])(
    'refuses %j inline and sends nothing',
    async (text) => {
      const api = stubApi({});
      mount(filled());
      const dialog = await openDialog();
      await userEvent.clear(field(dialog));
      if (text) await userEvent.type(field(dialog), text);
      await userEvent.click(confirm(dialog));
      expect(await screen.findByText(t.reopenDialog.invalid)).toBeTruthy();
      expect(field(dialog).getAttribute('aria-invalid')).toBe('true');
      expect(api.calls).toHaveLength(0);
    },
  );

  it('a double press sends one request', async () => {
    const api = stubApi({
      [PUT]: () => json(open({ version: 6, headcount: 2 })),
    });
    mount(filled());
    const dialog = await openDialog();
    await userEvent.dblClick(confirm(dialog));
    await gone();
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['STALE_STATE', t.stale],
    [
      'VACANCY_STATUS_INVALID',
      messages.vacancies.teamConflicts.VACANCY_STATUS_INVALID,
    ],
  ] as const)('409 %s stays inside the dialog', async (code, text) => {
    stubApi({
      [PUT]: () => problem(409, code),
      [GET_CARD]: () => json(open({ version: 6 })),
    });
    mount(filled());
    const dialog = await openDialog();
    await userEvent.click(confirm(dialog));
    expect((await screen.findByRole('alert')).textContent).toContain(text);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('a lost connection keeps the dialog and the retry works', async () => {
    let attempt = 0;
    const api = stubApi({
      [PUT]: () =>
        ++attempt === 1
          ? Promise.reject(new TypeError('offline'))
          : json(open({ version: 6 })),
    });
    mount(filled());
    const dialog = await openDialog();
    await userEvent.click(confirm(dialog));
    expect((await screen.findByRole('alert')).textContent).toContain(
      tTeam.noConnection,
    );
    await userEvent.click(confirm(dialog));
    await gone();
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(2);
  });

  it('a lost right (403) closes the dialog with the shared toast', async () => {
    stubApi({
      [PUT]: () => problem(403, 'FORBIDDEN'),
      [GET_CARD]: () => problem(404, 'NOT_FOUND'),
    });
    mount(filled());
    const dialog = await openDialog();
    await userEvent.click(confirm(dialog));
    await gone();
    expect(toast.error).toHaveBeenCalledWith(
      tTeam.toast.forbidden,
      expect.anything(),
    );
  });

  it('opens from the preview menu', async () => {
    stubApi({ [PUT]: () => json(open({ version: 6 })) });
    mount(filled(), true);
    await pick(t.reopen);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(confirm(dialog));
    await gone();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});
