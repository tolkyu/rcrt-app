import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile, type E2EUser } from '../support/e2e-session';
import { problemFulfill } from '../support/problem';
import { addTeamFixture, removeTeamFixtures } from '../support/vacancy-team-db';
import {
  SEEDED,
  alertDialogNamed,
  apiAs,
  button,
  claimByApi,
  detailOf,
  dialogNamed,
  fill,
  listRow,
  openCard,
  openList,
  subheading,
  teamSection,
  toastWith,
  tt,
  ts,
  tv,
  uniqueTitle,
  withVisitor,
} from './support/vacancy-team';

const HEAD = 'head.recruiter.gambling@demo';
const VERTICAL = 'Гемблінг';
const notFoundTitle = messages.errors.notFoundTitle;

test.beforeAll(removeTeamFixtures);
test.afterEach(removeTeamFixtures);

test.describe('a Recruiter takes a free vacancy [STORY-VAC-03-1, D130-2]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  test('from the card: confirm text, toast, the recruiter in «Рекрутери», focus on that subheading', async ({
    page,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Вільна на картці'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
    });
    await openCard(page, fixture);
    const team = teamSection(page);
    await expect(team.getByText(tt.noRecruiters)).toBeVisible();
    await expect(team.getByText(tt.freeHelper)).toBeVisible();
    await expect(button(team, tt.assign)).toHaveCount(0);

    await button(team, tt.claim).click();
    const dialog = alertDialogNamed(page, tt.claimDialog.title);
    await expect(dialog).toContainText(
      fill(tt.claimDialog.body, {
        title: fixture.title,
        number: fixture.number,
      }),
    );
    await button(dialog, tt.claimDialog.confirm).click();

    await expect(toastWith(page, tt.claimDialog.done)).toContainText(
      fill(tt.claimDialog.doneDescription, { number: fixture.number }),
    );
    await expect(button(team, tt.claim)).toHaveCount(0);
    await expect(
      team.getByText(SEEDED.recruiter1, { exact: true }),
    ).toBeVisible();
    await expect(subheading(page, tt.recruiters)).toBeFocused();
    const stored = await detailOf(page.request, fixture.id);
    expect(stored.recruiters.map((person) => person.fullName)).toEqual([
      SEEDED.recruiter1,
    ]);
    expect(stored.canSelfAssign).toBe(false);
  });

  test('from the list: the row button on desktop, the card button on a phone', async ({
    page,
    isMobile,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Вільна у списку'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
    });
    await openList(page, isMobile, fixture);
    const row = listRow(page, isMobile, fixture);
    const claim = isMobile
      ? button(row, tt.claim)
      : button(
          row,
          fill(tt.claimRowLabel, {
            number: fixture.number,
            title: fixture.title,
          }),
        );
    await expect(claim).toBeVisible();
    await claim.click();
    await button(
      alertDialogNamed(page, tt.claimDialog.title),
      tt.claimDialog.confirm,
    ).click();

    await expect(toastWith(page, tt.claimDialog.done)).toBeVisible();
    await expect(claim).toHaveCount(0);
    await expect(row).toBeVisible();
    if (!isMobile)
      await expect(row.getByRole('group', { name: tt.ownRow })).toBeVisible();
    const stored = await detailOf(page.request, fixture.id);
    expect(stored.recruiters.map((person) => person.fullName)).toEqual([
      SEEDED.recruiter1,
    ]);
  });

  for (const [name, outcome] of [
    [
      'a lost race (409 from the lock): warning toast, the dialog closes and the row leaves the list',
      'race',
    ],
    [
      'a claim after the other one committed (404, out of scope): the «not found» toast, the dialog closes and the row leaves the list',
      'late',
    ],
  ] as const)
    test(`another recruiter was first: ${name}`, async ({
      page,
      isMobile,
      playwright,
    }) => {
      const fixture = await addTeamFixture({
        title: uniqueTitle(`Гонка ${outcome}`),
        status: 'OPEN',
        teamLead: 'vasyl.tl@demo',
      });
      await openList(page, isMobile, fixture);
      const row = listRow(page, isMobile, fixture);
      await (
        isMobile
          ? button(row, tt.claim)
          : button(
              row,
              fill(tt.claimRowLabel, {
                number: fixture.number,
                title: fixture.title,
              }),
            )
      ).click();
      const dialog = alertDialogNamed(page, tt.claimDialog.title);
      await expect(dialog).toBeVisible();
      if (outcome === 'race')
        await page.route(
          new RegExp(`/api/v1/vacancies/${fixture.id}/recruiters/claim$`),
          async (route) =>
            route.fulfill(
              await problemFulfill(409, 'VACANCY_ALREADY_ASSIGNED'),
            ),
        );

      const rival = await apiAs(playwright, 'recruiter2.gambling@demo');
      await claimByApi(rival, fixture.id);
      await rival.dispose();
      await button(dialog, tt.claimDialog.confirm).click();

      if (outcome === 'race')
        await expect(toastWith(page, tt.claimDialog.lost)).toContainText(
          fill(tt.claimDialog.lostDescription, { number: fixture.number }),
        );
      else await expect(toastWith(page, tt.toast.gone)).toBeVisible();
      await expect(dialog).toHaveCount(0);
      await expect(row).toHaveCount(0);
      expect(
        (await page.request.get(`/api/v1/vacancies/${fixture.id}`)).status(),
      ).toBe(404);
    });
});

test.describe('a Head Recruiter shapes the team [STORY-VAC-03-1, STORY-VAC-03-2, D130, D131]', () => {
  test.use({ storageState: sessionFile(HEAD) });

  test('assigns two recruiters, removes one, then the last: the vacancy returns to the pool', async ({
    page,
    playwright,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Команда з нуля'),
      status: 'OPEN',
      teamLead: 'vasyl.tl@demo',
    });
    await openCard(page, fixture);
    const team = teamSection(page);
    await expect(button(team, tt.claim)).toHaveCount(0);

    await button(team, tt.assign).click();
    const picker = dialogNamed(page, tt.assignDialog.title);
    await expect(picker).toContainText(
      fill(tt.dialogHeader, {
        number: fixture.number,
        title: fixture.title,
        vertical: VERTICAL,
      }),
    );
    await expect(button(picker, tt.assignDialog.submit)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(picker.getByText(tt.assignDialog.condition)).toBeVisible();
    for (const name of [SEEDED.recruiter1, SEEDED.recruiter2])
      await picker.getByRole('checkbox', { name: new RegExp(name) }).check();
    await button(
      picker,
      fill(tt.assignDialog.submitCount, { count: '2' }),
    ).click();

    await expect(
      toastWith(page, fill(tt.assignDialog.doneMany, { count: '2' })),
    ).toBeVisible();
    await expect(picker).toHaveCount(0);
    for (const name of [SEEDED.recruiter1, SEEDED.recruiter2])
      await expect(team.getByText(name, { exact: true })).toBeVisible();
    await expect(subheading(page, tt.recruiters)).toBeFocused();

    await button(
      team,
      fill(tt.removeLabel, { name: SEEDED.recruiter2 }),
    ).click();
    const keepOthers = alertDialogNamed(page, tt.removeDialog.title);
    await expect(keepOthers).toContainText(tt.removeDialog.others);
    await button(keepOthers, tt.removeDialog.confirm).click();
    await expect(toastWith(page, tt.removeDialog.done)).toContainText(
      SEEDED.recruiter2,
    );
    await expect(
      team.getByText(SEEDED.recruiter2, { exact: true }),
    ).toHaveCount(0);

    await button(
      team,
      fill(tt.removeLabel, { name: SEEDED.recruiter1 }),
    ).click();
    const lastOne = alertDialogNamed(page, tt.removeDialog.title);
    await expect(lastOne).toContainText(
      fill(tt.removeDialog.lastOpen, { vertical: VERTICAL }),
    );
    await button(lastOne, tt.removeDialog.confirm).click();
    await expect(team.getByText(tt.noRecruiters)).toBeVisible();
    await expect(team.getByText(tt.freeHelper)).toBeVisible();

    const colleague = await apiAs(playwright, 'recruiter2.gambling@demo');
    const pooled = await detailOf(colleague, fixture.id);
    expect(pooled.recruiters).toEqual([]);
    expect(pooled.canSelfAssign).toBe(true);
    await colleague.dispose();
  });

  test('sets the first Team Lead of a recruiter-initiated vacancy once; the Team Lead then sees it', async ({
    page,
    browser,
    isMobile,
    playwright,
  }) => {
    const fixture = await addTeamFixture({
      title: uniqueTitle('Без тімліда'),
      status: 'OPEN',
      teamLead: null,
      recruiters: ['recruiter2.gambling@demo'],
    });
    const vasyl = await apiAs(playwright, 'vasyl.tl@demo');
    expect((await vasyl.get(`/api/v1/vacancies/${fixture.id}`)).status()).toBe(
      404,
    );

    await openCard(page, fixture);
    const team = teamSection(page);
    await expect(team.getByText(tt.noTeamLead)).toBeVisible();
    await button(team, tt.setTeamLead).click();
    const picker = dialogNamed(page, tt.teamLeadDialog.title);
    await expect(picker).toContainText(tt.teamLeadDialog.note);
    const choice = picker.getByRole('radio', {
      name: new RegExp(SEEDED.vasyl),
    });
    await expect(choice).not.toBeChecked();
    await expect(button(picker, tt.teamLeadDialog.submit)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await choice.check();
    await button(picker, tt.teamLeadDialog.submit).click();

    await expect(toastWith(page, tt.teamLeadDialog.done)).toContainText(
      SEEDED.vasyl,
    );
    await expect(team.getByText(SEEDED.vasyl, { exact: true })).toBeVisible();
    await expect(
      team.getByText(fill(tt.teamLeadCaption, { vertical: VERTICAL })),
    ).toBeVisible();
    await expect(button(team, tt.setTeamLead)).toHaveCount(0);
    await expect(subheading(page, tt.teamLead)).toBeFocused();
    const stored = await detailOf(page.request, fixture.id);
    expect(stored.teamLead?.fullName).toBe(SEEDED.vasyl);
    expect(stored.recruiterInitiated).toBe(true);

    expect((await vasyl.get(`/api/v1/vacancies/${fixture.id}`)).status()).toBe(
      200,
    );
    await vasyl.dispose();
    await withVisitor(browser, 'vasyl.tl@demo', async (visitor) => {
      await openList(visitor, isMobile, fixture);
      await expect(listRow(visitor, isMobile, fixture)).toContainText(
        fixture.number,
      );
    });
  });
});

const noTeamControls = (scope: Page | Locator) =>
  [tt.assign, tt.claim, tt.setTeamLead, ts.reopen].map((name) =>
    expect(button(scope, name)).toHaveCount(0),
  );

const READERS = [
  ['hr@demo', 'an HR manager'],
  ['head.hr@demo', 'the Head HR'],
] as const satisfies readonly (readonly [E2EUser, string])[];

test.describe('who gets no team controls [VAC-03-1, VAC-03-2, VAC-02-1, FIN-03]', () => {
  for (const [user, who] of READERS)
    test.describe(who, () => {
      test.use({ storageState: sessionFile(user) });

      test('reads a free and a staffed vacancy without one write control', async ({
        page,
      }) => {
        const free = await addTeamFixture({
          title: uniqueTitle('Вільна для читача'),
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
        });
        const staffed = await addTeamFixture({
          title: uniqueTitle('Укомплектована для читача'),
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
        });
        await openCard(page, free);
        const team = teamSection(page);
        await expect(team.getByText(tt.noRecruiters)).toBeVisible();
        await expect(team.getByText(tt.freeHelper)).toHaveCount(0);
        await Promise.all(noTeamControls(page));
        await Promise.all(
          [ts.hold, ts.resume].map((name) =>
            expect(button(page, name)).toHaveCount(0),
          ),
        );

        await openCard(page, staffed);
        await expect(
          team.getByText(SEEDED.recruiter1, { exact: true }),
        ).toBeVisible();
        await expect(
          team.getByRole('button', { name: /^Прибрати рекрутера/ }),
        ).toHaveCount(0);
        await Promise.all(noTeamControls(page));
        await expect(
          page.getByRole('button', {
            name: fill(ts.menuLabel, { title: staffed.title }),
          }),
        ).toHaveCount(0);
      });
    });

  test.describe('a Recruiter already on the vacancy', () => {
    test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

    test('sees the team read-only: no remove, assign, claim or status control', async ({
      page,
    }) => {
      const staffed = await addTeamFixture({
        title: uniqueTitle('Моя вакансія'),
        status: 'OPEN',
        teamLead: 'vasyl.tl@demo',
        recruiters: ['recruiter1.gambling@demo'],
      });
      await openCard(page, staffed);
      const team = teamSection(page);
      await expect(
        team.getByText(SEEDED.recruiter1, { exact: true }),
      ).toBeVisible();
      await expect(
        team.getByRole('button', { name: /^Прибрати рекрутера/ }),
      ).toHaveCount(0);
      await Promise.all(noTeamControls(page));
      await Promise.all(
        [ts.hold, ts.resume].map((name) =>
          expect(button(page, name)).toHaveCount(0),
        ),
      );
    });
  });

  test.describe('the Team Lead of the vacancy', () => {
    test.use({ storageState: sessionFile('vasyl.tl@demo') });

    test('has no assign, claim or Team Lead control on his own free vacancy', async ({
      page,
    }) => {
      const free = await addTeamFixture({
        title: uniqueTitle('Вільна тімліда'),
        status: 'OPEN',
        teamLead: 'vasyl.tl@demo',
      });
      await openCard(page, free);
      await expect(teamSection(page).getByText(tt.noRecruiters)).toBeVisible();
      await expect(teamSection(page).getByText(tt.freeHelper)).toHaveCount(0);
      await Promise.all(noTeamControls(page));
    });
  });

  for (const [user, who] of [
    ['finance@demo', 'Finance'],
    ['taras.tl@demo', 'a Team Lead of another vacancy'],
  ] as const)
    test.describe(who, () => {
      test.use({ storageState: sessionFile(user) });

      test('gets the 404 page of an unknown id for the card, with no hint of the vacancy', async ({
        page,
      }) => {
        const free = await addTeamFixture({
          title: uniqueTitle('Чужа вакансія'),
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
        });
        const response = await page.goto(`/vacancies/${free.id}`);
        expect(response?.status()).toBe(404);
        await expect(
          page.getByRole('heading', { level: 1, name: notFoundTitle }),
        ).toBeVisible();
        expect(await page.locator('body').innerText()).not.toContain(
          free.title,
        );
        await Promise.all(noTeamControls(page));
      });
    });

  test.describe('Finance', () => {
    test.use({ storageState: sessionFile('finance@demo') });

    test('has no «Вакансії» route at all', async ({ page }) => {
      const response = await page.goto('/vacancies');
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { level: 1, name: notFoundTitle }),
      ).toBeVisible();
      await expect(
        page.getByRole('table', { name: tv.caption, exact: true }),
      ).toHaveCount(0);
    });
  });
});
