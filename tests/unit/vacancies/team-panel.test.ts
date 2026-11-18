// @vitest-environment jsdom
import { useQuery } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamPanel } from '@/components/vacancies/team-panel';
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

const t = messages.vacancies.team;
const OKSANA = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Оксана Кравець',
  isActive: true,
};
const DMYTRO = {
  id: '22222222-2222-4222-8222-222222222222',
  fullName: 'Дмитро Лисенко',
  isActive: true,
};
const GET_LIST = `GET /vacancies/${ID}/assignable-recruiters`;
const GET_CARD = `GET /vacancies/${ID}`;
const POST_CLAIM = `POST /vacancies/${ID}/recruiters/claim`;
const POST_ASSIGN = `POST /vacancies/${ID}/recruiters`;
const TEAM_LEAD = `PUT /vacancies/${ID}/team-lead`;
const deleteRecruiter = (version: number) =>
  `DELETE /vacancies/${ID}/recruiters/${OKSANA.id}?expectedVersion=${version}`;

const pool = (...assigned: string[]) => ({
  items: [OKSANA, DMYTRO].map((person) => ({
    id: person.id,
    fullName: person.fullName,
    assigned: assigned.includes(person.id),
    active: true,
  })),
});

function Live({
  initial,
  onLost,
}: {
  initial: VacancyDetail;
  onLost?: () => void;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.vacancy(ID),
    queryFn: () => Promise.reject(new Error('the card is read through stubs')),
    enabled: false,
    initialData: initial,
  });
  return createElement(TeamPanel, {
    key: data.id,
    vacancy: data,
    preview: false,
    onLost,
  });
}

const mount = (initial: VacancyDetail, onLost?: () => void) =>
  mountTeam(createElement(Live, { initial, onLost }));
const press = (name: string | RegExp) =>
  userEvent.click(screen.getByRole('button', { name }));
/** The panel's own button carries the same label as the dialog's, so the dialog is awaited first. */
const inDialog = async (role: 'dialog' | 'alertdialog', name: string) =>
  within(await screen.findByRole(role)).getByRole('button', { name });
const heading = (name: string) => screen.getByRole('heading', { name });
const gone = () =>
  waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('«Команда»: controls come from the server flags [STORY-VAC-03-1, VAC-03-2, D130]', () => {
  it.each([
    ['no flag (Team Lead, HR, assigned Recruiter)', {}, []],
    ['claim only (Recruiter, free OPEN)', { canSelfAssign: true }, [t.claim]],
    [
      'manager',
      { canAssignRecruiters: true, canSetTeamLead: true },
      [t.assign, t.setTeamLead],
    ],
  ] as const)('%s', (_name, flags, shown) => {
    stubApi({});
    mount(vacancy(flags));
    for (const label of [t.claim, t.assign, t.setTeamLead])
      expect(!!screen.queryByRole('button', { name: label })).toBe(
        (shown as readonly string[]).includes(label),
      );
  });

  it('shows no control and the closed wording for a closed vacancy without a team', () => {
    stubApi({});
    mount(vacancy({ status: 'CANCELLED' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(t.noRecruitersClosed)).toBeTruthy();
    expect(screen.getByText(t.noTeamLead)).toBeTruthy();
  });

  it('says why an unassigned ON_HOLD vacancy has no recruiter, only to those who can staff it', () => {
    stubApi({});
    mount(vacancy({ status: 'ON_HOLD', canAssignRecruiters: true }));
    expect(screen.getByText(t.holdHelper)).toBeTruthy();
  });

  it('folds more than five recruiters behind «Ще N»', async () => {
    stubApi({});
    const many = Array.from({ length: 7 }, (_, index) => ({
      id: crypto.randomUUID(),
      fullName: `Рекрутер ${index + 1}`,
      isActive: true,
    }));
    mount(vacancy({ recruiters: many }));
    expect(screen.queryByText('Рекрутер 6')).toBeNull();
    const more = screen.getByRole('button', { name: 'Ще 2' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(more);
    expect(screen.getByText('Рекрутер 7')).toBeTruthy();
  });
});

describe('claim [STORY-VAC-03-1, D130-2]', () => {
  const claimed = () =>
    vacancy({ recruiters: [OKSANA], version: 2, canSelfAssign: false });

  it('opens on the primary button, sends one request for a double press, then hands focus to «Рекрутери»', async () => {
    const api = stubApi({ [POST_CLAIM]: () => json(claimed()) });
    const { queryClient } = mount(vacancy({ canSelfAssign: true }));
    await press(t.claim);
    const confirm = await inDialog('alertdialog', t.claimDialog.confirm);
    expect(document.activeElement).toBe(confirm);
    await userEvent.dblClick(confirm);
    await gone();
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    expect(api.calls[0]?.body).toEqual({});
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      t.claimDialog.done,
      expect.objectContaining({ id: `claim:${ID}` }),
    );
    expect(
      queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(ID))?.version,
    ).toBe(2);
    expect(screen.queryByRole('button', { name: t.claim })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(heading(t.recruiters)),
    );
  });

  it('loses the race: warning toast, no recruiter shown, the host is told to leave', async () => {
    stubApi({
      [POST_CLAIM]: () => problem(409, 'VACANCY_ALREADY_ASSIGNED'),
      [GET_CARD]: () => problem(404, 'NOT_FOUND'),
    });
    const onLost = vi.fn();
    mount(vacancy({ canSelfAssign: true }), onLost);
    await press(t.claim);
    await userEvent.click(await inDialog('alertdialog', t.claimDialog.confirm));
    await gone();
    expect(toast.warning).toHaveBeenCalledWith(
      t.claimDialog.lost,
      expect.objectContaining({ id: `claim:${ID}`, duration: 6000 }),
    );
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog on a lost connection, and the retry sends the same claim again', async () => {
    let attempt = 0;
    const api = stubApi({
      [POST_CLAIM]: () =>
        ++attempt === 1
          ? Promise.reject(new TypeError('offline'))
          : json(claimed()),
    });
    mount(vacancy({ canSelfAssign: true }));
    await press(t.claim);
    const confirm = await inDialog('alertdialog', t.claimDialog.confirm);
    await userEvent.click(confirm);
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.noConnection,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: t.claimDialog.confirm }),
    );
    await gone();
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(2);
  });

  it.each([
    [404, 'NOT_FOUND', t.toast.gone, 'error', true],
    [403, 'FORBIDDEN', t.toast.forbidden, 'error', true],
    [429, 'RATE_LIMITED', t.toast.rateLimited, 'warning', false],
  ] as const)(
    '%s → toast, dialog %s',
    async (status, code, text, tone, closes) => {
      stubApi({ [POST_CLAIM]: () => problem(status, code) });
      mount(vacancy({ canSelfAssign: true }));
      await press(t.claim);
      await userEvent.click(
        await screen.findByRole('button', { name: t.claimDialog.confirm }),
      );
      await waitFor(() =>
        expect(toast[tone]).toHaveBeenCalledWith(text, expect.anything()),
      );
      if (closes) await gone();
      else expect(screen.getByRole('alertdialog')).toBeTruthy();
    },
  );

  it('a closed vacancy is explained inside the dialog', async () => {
    stubApi({ [POST_CLAIM]: () => problem(409, 'VACANCY_CLOSED') });
    mount(vacancy({ canSelfAssign: true }));
    await press(t.claim);
    await userEvent.click(await inDialog('alertdialog', t.claimDialog.confirm));
    expect((await screen.findByRole('alert')).textContent).toContain(
      messages.vacancies.teamConflicts.VACANCY_CLOSED,
    );
  });
});

describe('assign recruiters [STORY-VAC-03-2]', () => {
  const open = async (
    routes: Parameters<typeof stubApi>[0],
    flags: Partial<VacancyDetail> = {},
  ) => {
    const api = stubApi({ [GET_LIST]: () => json(pool(OKSANA.id)), ...routes });
    const view = mount(
      vacancy({
        canAssignRecruiters: true,
        recruiters: [OKSANA],
        version: 1,
        ...flags,
      }),
    );
    await press(t.assign);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('checkbox', { name: /Дмитро Лисенко/ });
    return { api, dialog, ...view };
  };

  it('lists the pool with the assigned one checked and disabled, and blocks the button until a tick', async () => {
    const { dialog } = await open({});
    const assigned = within(dialog).getByRole('checkbox', {
      name: /Оксана Кравець/,
    });
    expect(assigned.getAttribute('aria-checked')).toBe('true');
    expect(assigned.hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByText(t.assignDialog.already)).toBeTruthy();
    const submit = within(dialog).getByRole('button', {
      name: t.assignDialog.submit,
    });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(within(dialog).getByText(t.assignDialog.condition)).toBeTruthy();
    await userEvent.click(submit);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('sends the ticked ids with the version the dialog opened on, once, and closes with a toast', async () => {
    const after = vacancy({ recruiters: [OKSANA, DMYTRO], version: 2 });
    const { api, dialog } = await open({
      [POST_ASSIGN]: () => json(after),
    });
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Дмитро Лисенко/ }),
    );
    const submit = within(dialog).getByRole('button', {
      name: t.assignDialog.submitCount.replace('{count}', '1'),
    });
    await userEvent.dblClick(submit);
    await gone();
    const posts = api.calls.filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({
      recruiterIds: [DMYTRO.id],
      expectedVersion: 1,
    });
    expect(toast.success).toHaveBeenCalledWith(
      t.assignDialog.doneOne,
      expect.objectContaining({
        description: `V-0005 · ${DMYTRO.fullName}`,
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(heading(t.recruiters)),
    );
  });

  it('keeps the ticks and the dialog on a stale version, then sends the retry at the version the refetch brought', async () => {
    let posted = 0;
    const { api, dialog } = await open({
      [POST_ASSIGN]: () =>
        ++posted === 1
          ? problem(409, 'STALE_STATE')
          : json(vacancy({ recruiters: [OKSANA, DMYTRO], version: 4 })),
      [GET_CARD]: () =>
        json(
          vacancy({
            recruiters: [OKSANA],
            version: 3,
            canAssignRecruiters: true,
          }),
        ),
    });
    const tick = within(dialog).getByRole('checkbox', {
      name: /Дмитро Лисенко/,
    });
    await userEvent.click(tick);
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Призначити \(1\)/ }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.assignDialog.errors.stale,
    );
    expect(tick.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Призначити \(1\)/ }),
    );
    await gone();
    const posts = api.calls.filter((call) => call.method === 'POST');
    expect(posts.map((call) => call.body)).toEqual([
      { recruiterIds: [DMYTRO.id], expectedVersion: 1 },
      { recruiterIds: [DMYTRO.id], expectedVersion: 3 },
    ]);
  });

  it('adopts the stored result when a stale answer is the echo of our own earlier attempt', async () => {
    const { dialog } = await open({
      [POST_ASSIGN]: () => problem(409, 'STALE_STATE'),
      [GET_CARD]: () =>
        json(vacancy({ recruiters: [OKSANA, DMYTRO], version: 2 })),
    });
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Дмитро Лисенко/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Призначити \(1\)/ }),
    );
    await gone();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('says which pick failed on 400 invalid_recruiter and refreshes the list', async () => {
    const { api, dialog } = await open({
      [POST_ASSIGN]: () =>
        problem(400, 'VALIDATION', [
          { path: 'body.recruiterIds', code: 'invalid_recruiter' },
        ]),
    });
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Дмитро Лисенко/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Призначити \(1\)/ }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.assignDialog.errors.invalid,
    );
    await waitFor(() =>
      expect(
        api.calls.filter((call) => call.path.endsWith('assignable-recruiters')),
      ).toHaveLength(2),
    );
  });

  it('offers only «Закрити» once the vacancy is closed', async () => {
    const { dialog } = await open({
      [POST_ASSIGN]: () => problem(409, 'VACANCY_CLOSED'),
    });
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Дмитро Лисенко/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Призначити \(1\)/ }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.assignDialog.errors.closed,
    );
    expect(
      within(dialog).queryByRole('button', { name: /Призначити/ }),
    ).toBeNull();
    // The footer button and the corner cross share the name.
    expect(
      within(dialog).getAllByRole('button', { name: t.assignDialog.close }),
    ).toHaveLength(2);
  });

  it('refuses the 21st pick with a visible reason', async () => {
    const people = Array.from({ length: 21 }, (_, index) => ({
      id: crypto.randomUUID(),
      fullName: `Кандидат ${String(index + 1).padStart(2, '0')}`,
      assigned: false,
      active: true,
    }));
    stubApi({ [GET_LIST]: () => json({ items: people }) });
    mount(vacancy({ canAssignRecruiters: true }));
    await press(t.assign);
    const dialog = await screen.findByRole('dialog');
    const boxes = await within(dialog).findAllByRole('checkbox');
    for (const box of boxes.slice(0, 20)) await userEvent.click(box);
    const last = boxes[20];
    expect(last?.getAttribute('aria-disabled')).toBe('true');
    expect(
      within(dialog).getByText(t.assignDialog.limit.replace('{max}', '20')),
    ).toBeTruthy();
    await userEvent.click(last!);
    expect(last?.getAttribute('aria-checked')).toBe('false');
    expect(within(dialog).getByRole('searchbox')).toBeTruthy();
  });

  it('shows the empty pool with only «Закрити», and a load error with a retry', async () => {
    stubApi({ [GET_LIST]: () => json({ items: [] }) });
    mount(vacancy({ canAssignRecruiters: true }));
    await press(t.assign);
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(t.assignDialog.emptyTitle),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole('button', { name: /Призначити/ }),
    ).toBeNull();
    cleanup();

    let fail = true;
    stubApi({
      [GET_LIST]: () => (fail ? problem(403, 'FORBIDDEN') : json(pool())),
    });
    mount(vacancy({ canAssignRecruiters: true }));
    await press(t.assign);
    const again = await screen.findByRole('dialog');
    expect((await within(again).findByRole('alert')).textContent).toContain(
      t.assignDialog.loadFailed,
    );
    fail = false;
    await userEvent.click(within(again).getByRole('button', { name: t.retry }));
    expect(
      await within(again).findByRole('checkbox', { name: /Дмитро Лисенко/ }),
    ).toBeTruthy();
  });

  it('closes on Escape without writing and gives the focus back to the button', async () => {
    const { api } = await open({});
    await userEvent.keyboard('{Escape}');
    await gone();
    expect(api.calls.some((call) => call.method !== 'GET')).toBe(false);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t.assign }),
      ),
    );
  });
});

describe('remove a recruiter [STORY-VAC-03-2]', () => {
  const mountWith = (flags: Partial<VacancyDetail> = {}) =>
    mount(
      vacancy({
        canAssignRecruiters: true,
        recruiters: [OKSANA],
        version: 1,
        ...flags,
      }),
    );
  const remove = () => press(t.removeLabel.replace('{name}', OKSANA.fullName));

  it('names the person on the button, warns that the last recruiter frees the vacancy, and opens on «Залишити»', async () => {
    stubApi({});
    mountWith();
    await remove();
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        t.removeDialog.lastOpen.replace('{vertical}', 'Гемблінг'),
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: t.removeDialog.keep }),
    );
  });

  it('says the others stay when more recruiters remain', async () => {
    stubApi({});
    mountWith({ recruiters: [OKSANA, DMYTRO] });
    await remove();
    expect(await screen.findByText(t.removeDialog.others)).toBeTruthy();
  });

  it('sends the version of the card, then shows the card without the person and focuses «Рекрутери»', async () => {
    const api = stubApi({
      [deleteRecruiter(1)]: () => json(vacancy({ recruiters: [], version: 2 })),
    });
    mountWith();
    await remove();
    await userEvent.click(
      await inDialog('alertdialog', t.removeDialog.confirm),
    );
    await gone();
    expect(api.calls[0]?.method).toBe('DELETE');
    expect(toast.success).toHaveBeenCalledWith(
      t.removeDialog.done,
      expect.anything(),
    );
    expect(screen.queryByText(OKSANA.fullName)).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(heading(t.recruiters)),
    );
  });

  it.each([
    ['a stale card', 'STALE_STATE', t.removeDialog.stale],
    [
      'a closed vacancy',
      'VACANCY_CLOSED',
      messages.vacancies.teamConflicts.VACANCY_CLOSED,
    ],
  ])('ends with a toast for %s', async (_name, code, text) => {
    stubApi({
      [deleteRecruiter(1)]: () => problem(409, code),
      [GET_CARD]: () => json(vacancy({ recruiters: [OKSANA], version: 5 })),
    });
    mountWith();
    await remove();
    await userEvent.click(
      await inDialog('alertdialog', t.removeDialog.confirm),
    );
    await gone();
    expect(toast.warning).toHaveBeenCalledWith(text, expect.anything());
  });

  it('keeps the dialog on a lost connection so the same removal can be sent again', async () => {
    stubApi({
      [deleteRecruiter(1)]: () => Promise.reject(new TypeError('offline')),
    });
    mountWith();
    await remove();
    await userEvent.click(
      await inDialog('alertdialog', t.removeDialog.confirm),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.noConnection,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('shows no remove button to a viewer without the flag', () => {
    stubApi({});
    mountWith({ canAssignRecruiters: false });
    expect(screen.queryByRole('button', { name: /Прибрати/ })).toBeNull();
  });
});

describe('first Team Lead [STORY-VAC-03-2, D130-3]', () => {
  const TARAS = {
    id: '33333333-3333-4333-8333-333333333333',
    fullName: 'Тарас Коваль',
    priority: 1,
  };
  const VASYL = {
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Василь Петренко',
    priority: null,
  };
  const setup = async (routes: Parameters<typeof stubApi>[0] = {}) => {
    const card = vacancy({ canSetTeamLead: true, version: 1 });
    const api = stubApi({
      [`GET /verticals/${card.vertical.id}/team-leads`]: () =>
        json({ items: [TARAS, VASYL] }),
      ...routes,
    });
    const view = mount(card);
    await press(t.setTeamLead);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('radio', { name: /Тарас Коваль/ });
    return { api, dialog, card, ...view };
  };

  it('states that it happens once, preselects nobody and blocks the button until a choice', async () => {
    const { dialog } = await setup();
    expect(within(dialog).getByText(t.teamLeadDialog.note)).toBeTruthy();
    for (const radio of within(dialog).getAllByRole('radio'))
      expect(radio.getAttribute('aria-checked')).toBe('false');
    expect(
      within(dialog)
        .getByRole('button', { name: t.teamLeadDialog.submit })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(within(dialog).getByText('П1')).toBeTruthy();
    expect(within(dialog).queryByText('Пnull')).toBeNull();
  });

  it('sends the chosen Team Lead once and focuses the «Тімлід» subheading', async () => {
    const { api, dialog } = await setup({
      [TEAM_LEAD]: () =>
        json(
          vacancy({
            teamLead: {
              id: TARAS.id,
              fullName: TARAS.fullName,
              isActive: true,
            },
            canSetTeamLead: false,
            version: 2,
          }),
        ),
    });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /Тарас Коваль/ }),
    );
    await userEvent.dblClick(
      within(dialog).getByRole('button', { name: t.teamLeadDialog.submit }),
    );
    await gone();
    const puts = api.calls.filter((call) => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({ teamLeadId: TARAS.id, expectedVersion: 1 });
    expect(toast.success).toHaveBeenCalledWith(
      t.teamLeadDialog.done,
      expect.objectContaining({ description: `V-0005 · ${TARAS.fullName}` }),
    );
    expect(screen.queryByRole('button', { name: t.setTeamLead })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(heading(t.teamLead)),
    );
  });

  it('closes with a toast when another Team Lead was set meanwhile', async () => {
    const { dialog } = await setup({
      [TEAM_LEAD]: () => problem(409, 'TEAM_LEAD_ALREADY_SET'),
      [GET_CARD]: () => json(vacancy({ version: 3 })),
    });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /Тарас Коваль/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.teamLeadDialog.submit }),
    );
    await gone();
    expect(toast.warning).toHaveBeenCalledWith(
      messages.vacancies.teamConflicts.TEAM_LEAD_ALREADY_SET,
      expect.anything(),
    );
  });

  it('on an ineligible pick shows the message, reads the list again and clears the choice', async () => {
    const { api, dialog } = await setup({
      [TEAM_LEAD]: () =>
        problem(400, 'VALIDATION', [
          { path: 'body.teamLeadId', code: 'invalid_team_lead' },
        ]),
    });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /Василь Петренко/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: t.teamLeadDialog.submit }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.teamLeadDialog.errors.invalid,
    );
    await waitFor(() =>
      expect(
        api.calls.filter((call) => call.path.endsWith('/team-leads')),
      ).toHaveLength(2),
    );
  });

  it('keeps the choice on a stale version and sends the retry at the new version', async () => {
    let put = 0;
    const { api, dialog } = await setup({
      [TEAM_LEAD]: () =>
        ++put === 1
          ? problem(409, 'STALE_STATE')
          : json(vacancy({ version: 5, canSetTeamLead: false })),
      [GET_CARD]: () => json(vacancy({ version: 4, canSetTeamLead: true })),
    });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /Тарас Коваль/ }),
    );
    const submit = within(dialog).getByRole('button', {
      name: t.teamLeadDialog.submit,
    });
    await userEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain(
      t.teamLeadDialog.errors.stale,
    );
    await userEvent.click(submit);
    await gone();
    expect(
      api.calls.filter((call) => call.method === 'PUT').map((c) => c.body),
    ).toEqual([
      { teamLeadId: TARAS.id, expectedVersion: 1 },
      { teamLeadId: TARAS.id, expectedVersion: 4 },
    ]);
  });

  it('shows the empty state with only «Закрити»', async () => {
    const card = vacancy({ canSetTeamLead: true });
    stubApi({
      [`GET /verticals/${card.vertical.id}/team-leads`]: () =>
        json({ items: [] }),
    });
    mount(card);
    await press(t.setTeamLead);
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(t.teamLeadDialog.emptyTitle),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole('button', { name: t.teamLeadDialog.submit }),
    ).toBeNull();
  });
});
