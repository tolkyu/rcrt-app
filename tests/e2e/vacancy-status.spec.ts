import { expect, test, type Page } from '@playwright/test';
import { sessionFile } from '../support/e2e-session';
import { addTeamFixture, removeTeamFixtures } from '../support/vacancy-team-db';
import { openMenu } from './support/vacancy-gallery';
import {
  SEEDED,
  apiAs,
  button,
  cardTitle,
  chip,
  detailOf,
  dialogNamed,
  alertDialogNamed,
  fill,
  header,
  holdWrite,
  listRow,
  openCard,
  openList,
  rowMenu,
  statusOf,
  teamSection,
  toastWith,
  ts,
  tt,
  tv,
  uniqueTitle,
  withVisitor,
} from './support/vacancy-team';

const HEAD = 'head.recruiter.gambling@demo';
const REASON =
  'Команда змінила плани найму.\nРекрутер Олена продовжує інші позиції.';
const statusUrl = (id: string) => new RegExp(`/api/v1/vacancies/${id}/status$`);
const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });
const reasonBox = (page: Page) =>
  page.getByRole('textbox', {
    name: new RegExp(`^${ts.cancelDialog.reasonLabel}`),
  });

test.beforeAll(removeTeamFixtures);
test.afterEach(removeTeamFixtures);

test.describe('a Head Recruiter pauses and resumes [STORY-VAC-02-1, D130]', () => {
  test.use({ storageState: sessionFile(HEAD) });

  test('from the card the chip and the button flip before the server answers; the toasts follow', async ({
    page,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Пауза з картки'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
      recruiters: ['recruiter1.gambling@demo'],
    });
    await openCard(page, fixture);
    await expect(chip(page, 'OPEN')).toBeVisible();
    const release = await holdWrite(page, statusUrl(fixture.id), 'PUT');

    await button(page, ts.hold).click();
    await expect(chip(page, 'ON_HOLD')).toBeVisible();
    await expect(button(page, ts.resume)).toBeVisible();
    await expect(button(page, ts.hold)).toHaveCount(0);
    await expect(header(page)).toContainText(ts.banner.onHold);
    await expect(toastWith(page, ts.toast.held)).toHaveCount(0);

    release();
    await expect(toastWith(page, ts.toast.held)).toContainText(fixture.number);
    expect((await detailOf(page.request, fixture.id)).status).toBe('ON_HOLD');

    await button(page, ts.resume).click();
    await expect(chip(page, 'OPEN')).toBeVisible();
    await expect(button(page, ts.hold)).toBeVisible();
    await expect(toastWith(page, ts.toast.resumed)).toContainText(
      fill(ts.toast.resumedDescription, {
        number: fixture.number,
        status: tv.status.OPEN,
      }),
    );
    expect((await detailOf(page.request, fixture.id)).status).toBe('OPEN');
  });

  test('a paused vacancy nobody works on says why recruiters do not see it, in the note and the team block', async ({
    page,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Пауза без рекрутера'),
      status: 'ON_HOLD',
      teamLead: 'vasyl.tl@demo',
    });
    await openCard(page, fixture);
    await expect(chip(page, 'ON_HOLD')).toBeVisible();
    await expect(header(page)).toContainText(ts.banner.onHold);
    await expect(header(page)).toContainText(ts.banner.onHoldFree);
    await expect(teamSection(page).getByText(tt.holdHelper)).toBeVisible();
    await expect(button(page, ts.resume)).toBeVisible();
    await expect(button(teamSection(page), tt.assign)).toBeVisible();
  });
});

test.describe('a Team Lead acts on his own vacancy from the list row menu [STORY-VAC-02-1, D130]', () => {
  test.use({ storageState: sessionFile('vasyl.tl@demo') });

  test('pause is optimistic, resume follows, cancel asks for a reason and the row loses its menu', async ({
    page,
    isMobile,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Рядок тімліда'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
      recruiters: ['recruiter1.gambling@demo'],
    });
    await openList(page, isMobile, fixture);
    const row = listRow(page, isMobile, fixture);
    const trigger = rowMenu(row, fixture);
    const release = await holdWrite(page, statusUrl(fixture.id), 'PUT');

    await openMenu(trigger, menuItem(page, ts.hold));
    await expect(menuItem(page, ts.cancel)).toBeVisible();
    await expect(menuItem(page, ts.reopen)).toHaveCount(0);
    await menuItem(page, ts.hold).click();
    await expect(
      row.getByText(tv.status.ON_HOLD, { exact: true }),
    ).toBeVisible();
    await expect(toastWith(page, ts.toast.held)).toHaveCount(0);
    release();
    await expect(toastWith(page, ts.toast.held)).toContainText(fixture.number);

    await openMenu(trigger, menuItem(page, ts.resume));
    await expect(menuItem(page, ts.hold)).toHaveCount(0);
    await menuItem(page, ts.resume).click();
    await expect(row.getByText(tv.status.OPEN, { exact: true })).toBeVisible();
    await expect(toastWith(page, ts.toast.resumed)).toBeVisible();

    await openMenu(trigger, menuItem(page, ts.cancel));
    await menuItem(page, ts.cancel).click();
    const dialog = alertDialogNamed(page, ts.cancelDialog.title);
    await expect(dialog).toBeVisible();
    const confirm = button(dialog, ts.cancelDialog.confirm);
    await expect(confirm).toBeDisabled();
    await reasonBox(page).fill('Потребу закрили іншою вакансією.');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(toastWith(page, ts.cancelDialog.done)).toBeVisible();
    await expect(
      row.getByText(tv.status.CANCELLED, { exact: true }),
    ).toBeVisible();
    await expect(trigger).toHaveCount(0);
    expect((await detailOf(page.request, fixture.id)).status).toBe('CANCELLED');
  });

  test('a filled vacancy of his own cannot be reopened by him: no button, no menu, 403 from the API', async ({
    page,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Закрита тімліда'),
      status: 'FILLED',
      teamLead: 'vasyl.tl@demo',
      recruiters: ['recruiter1.gambling@demo'],
    });
    await openCard(page, fixture);
    await expect(chip(page, 'FILLED')).toBeVisible();
    await expect(button(page, ts.reopen)).toHaveCount(0);
    await expect(
      button(page, fill(ts.menuLabel, { title: fixture.title })),
    ).toHaveCount(0);
    const answer = await statusOf(page.request, fixture.id, {
      action: 'REOPEN',
      expectedVersion: (await detailOf(page.request, fixture.id)).version,
    });
    expect(answer.status()).toBe(403);
  });
});

test.describe('cancel and reopen [STORY-VAC-02-1, D130-4, D131]', () => {
  test.use({ storageState: sessionFile(HEAD) });

  test('a cancel needs a reason; readers of the vacancy see it; a cancelled vacancy has no way back', async ({
    page,
    browser,
    playwright,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Скасування'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
      recruiters: ['recruiter1.gambling@demo'],
    });
    await openCard(page, fixture);
    const trigger = button(page, fill(ts.menuLabel, { title: fixture.title }));
    await openMenu(trigger, menuItem(page, ts.cancel));
    await menuItem(page, ts.cancel).click();
    const dialog = alertDialogNamed(page, ts.cancelDialog.title);
    await expect(dialog).toContainText(ts.cancelDialog.consequence);
    await expect(button(dialog, ts.cancelDialog.keep)).toBeFocused();
    const confirm = button(dialog, ts.cancelDialog.confirm);
    await expect(confirm).toBeDisabled();
    await reasonBox(page).fill(REASON);
    await confirm.click();

    await expect(toastWith(page, ts.cancelDialog.done)).toContainText(
      fill(ts.cancelDialog.doneDescription, { number: fixture.number }),
    );
    await expect(chip(page, 'CANCELLED')).toBeVisible();
    await expect(
      page.getByText(/Вакансію скасовано \d{2}\.\d{2}\.\d{4}\./),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: tv.draft.cancelReasonTitle }),
    ).toBeVisible();
    await expect(page.getByText(REASON.split('\n')[0]!)).toBeVisible();
    await expect(cardTitle(page, fixture)).toBeFocused();
    for (const name of [ts.hold, ts.resume, ts.reopen, tt.assign])
      await expect(button(page, name)).toHaveCount(0);
    await expect(trigger).toHaveCount(0);

    for (const user of [
      'recruiter1.gambling@demo',
      'hr@demo',
      'vasyl.tl@demo',
    ] as const)
      await withVisitor(browser, user, async (visitor) => {
        await openCard(visitor, fixture);
        await expect(
          visitor.getByRole('heading', { name: tv.draft.cancelReasonTitle }),
        ).toBeVisible();
        await expect(visitor.getByText(REASON.split('\n')[0]!)).toBeVisible();
      });

    const admin = await apiAs(playwright, 'admin@demo');
    const stored = await detailOf(admin, fixture.id);
    expect(stored.cancelReason).toBe(REASON);
    const reopen = await statusOf(admin, fixture.id, {
      action: 'REOPEN',
      expectedVersion: stored.version,
    });
    expect(reopen.status()).toBe(409);
    expect(((await reopen.json()) as { code: string }).code).toBe(
      'VACANCY_STATUS_INVALID',
    );
    await admin.dispose();
  });

  test('a filled vacancy is reopened with a new headcount, and goes back to the open set', async ({
    page,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Повторне відкриття'),
      status: 'FILLED',
      teamLead: 'vasyl.tl@demo',
      recruiters: ['recruiter1.gambling@demo'],
      headcount: 2,
      urgent: true,
    });
    await openCard(page, fixture);
    await expect(chip(page, 'FILLED')).toBeVisible();
    await expect(
      page.getByText(/Вакансію закрито 13\.11\.2026 — Заповнена/),
    ).toBeVisible();
    for (const name of [ts.hold, ts.resume, tt.assign])
      await expect(button(page, name)).toHaveCount(0);
    await expect(
      teamSection(page).getByText(SEEDED.recruiter1, { exact: true }),
    ).toBeVisible();

    await button(page, ts.reopen).click();
    const dialog = dialogNamed(page, ts.reopenDialog.title);
    const field = dialog.getByRole('textbox', {
      name: new RegExp(`^${ts.reopenDialog.headcount}`),
    });
    await expect(field).toHaveValue('2');
    await expect(field).toBeFocused();
    await button(dialog, ts.reopenDialog.increase).click();
    await expect(field).toHaveValue('3');
    await button(dialog, ts.reopenDialog.confirm).click();

    await expect(toastWith(page, ts.reopenDialog.done)).toContainText(
      fill(ts.reopenDialog.doneChanged, {
        number: fixture.number,
        status: tv.status.OPEN,
        from: '2',
        to: '3',
      }),
    );
    await expect(chip(page, 'OPEN')).toBeVisible();
    await expect(button(page, ts.hold)).toBeVisible();
    await expect(button(page, ts.reopen)).toHaveCount(0);
    await expect(cardTitle(page, fixture)).toBeFocused();
    const stored = await detailOf(page.request, fixture.id);
    expect(stored).toMatchObject({
      status: 'OPEN',
      headcount: 3,
      priority: 'URGENT',
    });
  });
});

test.describe('a free vacancy and the Recruiter list [D130-5, D131]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  test('a manager pauses an unassigned vacancy: it leaves the list and the API; resumed, it is back; an assigned recruiter keeps seeing a paused one', async ({
    page,
    isMobile,
    playwright,
  }) => {
    const free = await addTeamFixture({
      title: uniqueTitle('Вільна на паузі'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
    });
    const mine = await addTeamFixture({
      title: uniqueTitle('Моя на паузі'),
      status: 'ON_HOLD',
      teamLead: 'vasyl.tl@demo',
      recruiters: ['recruiter1.gambling@demo'],
    });
    await openList(page, isMobile, free);

    const admin = await apiAs(playwright, 'admin@demo');
    const hold = await statusOf(admin, free.id, {
      action: 'HOLD',
      expectedVersion: (await detailOf(admin, free.id)).version,
    });
    expect(hold.status()).toBe(200);
    await page.reload();
    await expect(
      page.getByRole('region', { name: tv.resultsLabel }),
    ).toBeVisible();
    await expect(listRow(page, isMobile, free)).toHaveCount(0);
    expect(
      (await page.request.get(`/api/v1/vacancies/${free.id}`)).status(),
    ).toBe(404);

    const resume = await statusOf(admin, free.id, {
      action: 'RESUME',
      expectedVersion: (await detailOf(admin, free.id)).version,
    });
    expect(resume.status()).toBe(200);
    await admin.dispose();
    await page.reload();
    await expect(listRow(page, isMobile, free)).toBeVisible();

    expect((await detailOf(page.request, mine.id)).status).toBe('ON_HOLD');
  });
});
