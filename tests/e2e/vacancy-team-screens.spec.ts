import { expect, test, type Page, type TestInfo } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { DEMO_VERTICALS } from '../../server/db/seed';
import { E2E_ORIGIN, sessionFile, signIn } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { withIsolatedActor } from '../support/isolated-actor';
import { withOwner } from '../support/vacancy-request-db';
import { demoVacancy } from '../support/vacancy-demo';
import {
  addPickerRecruiter,
  addTeamFixture,
  pinClosedDay,
  removePickerRecruiter,
  removeTeamFixtures,
  TEAM_MARKER,
  type TeamFixture,
  type TeamFixtureSpec,
} from '../support/vacancy-team-db';
import {
  captureScreen,
  forEachTheme,
  installFixedClock,
  viewportOf,
} from './screens';
import { openMenu, scanState } from './support/vacancy-gallery';
import {
  alertDialogNamed,
  apiAs,
  button,
  cardMenu,
  chip,
  detailOf,
  dialogNamed,
  fill,
  header,
  holdWrite,
  openCard,
  statusOf,
  subheading,
  teamSection,
  ts,
  tt,
  tv,
} from './support/vacancy-team';

const HEAD = 'head.recruiter.gambling@demo';
const TITLE = 'Медіабаєр — Facebook';
const DESCRIPTION = 'Шукаємо медіабаєра для запуску кампаній у Facebook.';
const REASON = 'Команда змінила плани найму.';
const CLOSED_REASON =
  'Команда змінила плани найму.\nВакансію закрили до кінця кварталу.';
const DESKTOP_ONLY = 'the layout is captured at 1440 only';
const PHONE_ONLY = 'the layout is captured at 390 only';
const urgencyUrl = (id: string) =>
  new RegExp(`/api/v1/vacancies/${id}/urgency$`);

const menuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });
const reasonBox = (page: Page) =>
  page.getByRole('textbox', {
    name: new RegExp(`^${ts.cancelDialog.reasonLabel}`),
  });

const setTheme = (page: Page, theme: 'light' | 'dark') =>
  page.context().addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);

/** The fixture shows a fixed number whatever identity value the database handed out, and Ukrainian text in place of its cleanup marker. */
async function stage(page: Page, fixed?: readonly [TeamFixture, string]) {
  await installFixedClock(page, [
    [TEAM_MARKER, DESCRIPTION],
    ...(fixed ? [[fixed[0].number, fixed[1]] as const] : []),
  ]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function fixture(
  page: Page,
  spec: Omit<TeamFixtureSpec, 'title'>,
  number: string,
) {
  const created = await addTeamFixture({ title: TITLE, ...spec });
  await stage(page, [created, number]);
  return created;
}

/** `<NN>-<role>-vacancy-<topic>-<state>-<viewport>-<theme>.png` after the accessibility scan. */
async function snap(
  page: Page,
  info: TestInfo,
  file: string,
  theme: 'light' | 'dark',
) {
  await scanState(page, info);
  await captureScreen(
    page,
    info,
    `${file}-${viewportOf(info)}-${theme}.png`,
    'phase-2',
  );
}

test.beforeAll(removeTeamFixtures);
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await removeTeamFixtures();
});

test.describe('urgency on the card [STORY-VAC-08-2, SHOT-01..03, D125]', () => {
  test.describe('Admin', () => {
    test.use({ storageState: sessionFile('admin@demo') });

    test('C1, C2: an urgent open vacancy has the tinted header and the editable urgency', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(isMobile, DESKTOP_ONLY);
      await stage(page);
      const seeded = demoVacancy(1);
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, `/vacancies/${seeded.id}`);
        await expect(
          page.getByRole('radiogroup', { name: tv.urgency.label }),
        ).toBeVisible();
        await expect(
          page.getByRole('radio', { name: tv.urgency.URGENT }),
        ).toBeChecked();
        await snap(page, info, '48-admin-vacancy-urgency-open', theme);
      });
    });
  });

  test.describe('Head Recruiter', () => {
    test.use({ storageState: sessionFile(HEAD) });

    test('C3: an urgent filled vacancy has the neutral header, the closed note and no urgency section', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(isMobile, DESKTOP_ONLY);
      const filled = await fixture(
        page,
        {
          status: 'FILLED',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
          headcount: 2,
          urgent: true,
        },
        'V-0003',
      );
      await setTheme(page, 'light');
      await openCard(page, filled);
      await expect(header(page)).not.toContainText(tv.urgentClosed);
      await expect(
        page.getByText(
          tv.statusMenu.banner.filled.replace(
            '{at, date, ::dd.MM.yyyy}',
            '13.11.2026',
          ),
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole('radiogroup', { name: tv.urgency.label }),
      ).toHaveCount(0);
      await snap(
        page,
        info,
        '48-head-recruiter-vacancy-urgency-filled',
        'light',
      );
    });

    test('C4: switching an ordinary vacancy to urgent tints the header before the server answers', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(!isMobile, PHONE_ONLY);
      const open = await fixture(
        page,
        {
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
        },
        'V-0007',
      );
      await setTheme(page, 'light');
      await openCard(page, open);
      const urgent = page.getByRole('radio', { name: tv.urgency.URGENT });
      await expect(urgent).not.toBeChecked();
      const release = await holdWrite(page, urgencyUrl(open.id), 'PUT');
      await page
        .getByRole('radiogroup', { name: tv.urgency.label })
        .getByText(tv.urgency.URGENT, { exact: true })
        .click();
      await expect(urgent).toBeChecked();
      await expect(
        header(page).getByText(tv.urgent, { exact: true }),
      ).toBeVisible();
      await snap(
        page,
        info,
        '48-head-recruiter-vacancy-urgency-switching',
        'light',
      );
      release();
      await expect
        .poll(async () => (await detailOf(page.request, open.id)).priority)
        .toBe('URGENT');
    });
  });

  test.describe('Team Lead', () => {
    test.use({ storageState: sessionFile('vasyl.tl@demo') });

    test('C5: an urgent open vacancy on a phone has the tint and no urgency section', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(!isMobile, PHONE_ONLY);
      await stage(page);
      const seeded = demoVacancy(1);
      await setTheme(page, 'light');
      await openHydrated(page, `/vacancies/${seeded.id}`);
      await expect(
        page.getByRole('heading', { level: 1, name: seeded.title }),
      ).toBeVisible();
      await expect(
        page.getByRole('radiogroup', { name: tv.urgency.label }),
      ).toHaveCount(0);
      await snap(page, info, '48-team-lead-vacancy-urgency-open', 'light');
    });
  });
});

test.describe('team dialogs of the Head Recruiter [STORY-VAC-03-1, STORY-VAC-03-2, SHOT-01..03, D125]', () => {
  test.use({ storageState: sessionFile(HEAD) });
  test.skip(({ isMobile }) => isMobile, DESKTOP_ONLY);

  test('T1, T2: a recruiter-initiated vacancy with nobody assigned', async ({
    page,
  }, info) => {
    const free = await fixture(
      page,
      { status: 'OPEN', teamLead: null },
      'V-0012',
    );
    await forEachTheme(page, async (theme) => {
      await openCard(page, free);
      const team = teamSection(page);
      await expect(team.getByText(tt.noTeamLead)).toBeVisible();
      await expect(button(team, tt.setTeamLead)).toBeVisible();
      await expect(button(team, tt.assign)).toBeVisible();
      await snap(
        page,
        info,
        '49-head-recruiter-vacancy-team-unassigned',
        theme,
      );
    });
  });

  test.describe('with a third eligible recruiter', () => {
    test.beforeAll(async () => {
      await removePickerRecruiter();
      await addPickerRecruiter('Дмитро Лисенко');
    });
    test.afterAll(removePickerRecruiter);

    test('T3, T4: «Призначити рекрутера» with one already assigned and one ticked', async ({
      page,
    }, info) => {
      const staffed = await fixture(
        page,
        {
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
        },
        'V-0010',
      );
      await forEachTheme(page, async (theme) => {
        await openCard(page, staffed);
        await button(teamSection(page), tt.assign).click();
        const picker = dialogNamed(page, tt.assignDialog.title);
        await expect(picker.getByRole('checkbox')).toHaveCount(3);
        await picker.getByRole('checkbox', { name: /Андрій Бондар/ }).check();
        await expect(
          button(picker, fill(tt.assignDialog.submitCount, { count: '1' })),
        ).toBeVisible();
        await snap(
          page,
          info,
          '49-head-recruiter-vacancy-team-assign-dialog',
          theme,
        );
      });
    });
  });

  test('T5: «Призначити тімліда» with the one-time note and one radio chosen', async ({
    page,
  }, info) => {
    const free = await fixture(
      page,
      { status: 'OPEN', teamLead: null },
      'V-0012',
    );
    await setTheme(page, 'light');
    await openCard(page, free);
    await button(teamSection(page), tt.setTeamLead).click();
    const picker = dialogNamed(page, tt.teamLeadDialog.title);
    await expect(picker).toContainText(tt.teamLeadDialog.note);
    await picker.getByRole('radio', { name: /Василь Мороз/ }).check();
    await snap(
      page,
      info,
      '49-head-recruiter-vacancy-team-lead-dialog',
      'light',
    );
  });

  test('T6: «Прибрати рекрутера?» for the last recruiter of an open vacancy', async ({
    page,
  }, info) => {
    const staffed = await fixture(
      page,
      {
        status: 'OPEN',
        teamLead: 'vasyl.tl@demo',
        recruiters: ['recruiter1.gambling@demo'],
      },
      'V-0010',
    );
    await setTheme(page, 'light');
    await openCard(page, staffed);
    await button(
      teamSection(page),
      fill(tt.removeLabel, { name: 'Марія Шевченко' }),
    ).click();
    const confirm = alertDialogNamed(page, tt.removeDialog.title);
    await expect(confirm).toContainText(
      fill(tt.removeDialog.lastOpen, { vertical: 'Гемблінг' }),
    );
    await snap(
      page,
      info,
      '49-head-recruiter-vacancy-team-remove-confirm',
      'light',
    );
  });
});

test.describe('a Recruiter takes a free vacancy [STORY-VAC-03-1, SHOT-01..03, D125]', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  test('T7: the card with «Взяти вакансію» and its confirm', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, DESKTOP_ONLY);
    const free = await fixture(
      page,
      { status: 'OPEN', teamLead: 'vasyl.tl@demo' },
      'V-0010',
    );
    await setTheme(page, 'light');
    await openCard(page, free);
    await button(teamSection(page), tt.claim).click();
    await expect(alertDialogNamed(page, tt.claimDialog.title)).toContainText(
      fill(tt.claimDialog.body, { title: TITLE, number: 'V-0010' }),
    );
    await snap(page, info, '49-recruiter-vacancy-team-claim-confirm', 'light');
  });

  test('T8: the list card with the full-width button and the confirm sheet', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(!isMobile, PHONE_ONLY);
    await fixture(
      page,
      { status: 'OPEN', teamLead: 'vasyl.tl@demo' },
      'V-0015',
    );
    await setTheme(page, 'light');
    await openHydrated(page, '/vacancies');
    const card = page
      .getByRole('list', { name: tv.caption, exact: true })
      .getByRole('listitem')
      .filter({ hasText: 'V-0015' });
    await expect(card).toBeVisible();
    await button(card, tt.claim).click();
    await expect(alertDialogNamed(page, tt.claimDialog.title)).toBeVisible();
    await snap(page, info, '49-recruiter-vacancy-team-claim-list', 'light');
  });
});

test.describe('status of the vacancy [STORY-VAC-02-1, SHOT-01..03, D125]', () => {
  test.describe('Head Recruiter', () => {
    test.use({ storageState: sessionFile(HEAD) });

    test('S1: a paused vacancy nobody works on', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(isMobile, DESKTOP_ONLY);
      const held = await fixture(
        page,
        { status: 'ON_HOLD', teamLead: 'vasyl.tl@demo' },
        'V-0007',
      );
      await setTheme(page, 'light');
      await openCard(page, held);
      await expect(chip(page, 'ON_HOLD')).toBeVisible();
      await expect(button(page, ts.resume)).toBeVisible();
      await expect(subheading(page, tt.recruiters)).toBeVisible();
      await snap(
        page,
        info,
        '50-head-recruiter-vacancy-status-on-hold',
        'light',
      );
    });

    test('S4, S5: «Скасувати вакансію?» with a reason typed', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(isMobile, DESKTOP_ONLY);
      const open = await fixture(
        page,
        {
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
        },
        'V-0007',
      );
      await forEachTheme(page, async (theme) => {
        await openCard(page, open);
        const trigger = button(page, fill(ts.menuLabel, { title: open.title }));
        await openMenu(trigger, menuItem(page, ts.cancel));
        await menuItem(page, ts.cancel).click();
        await expect(
          alertDialogNamed(page, ts.cancelDialog.title),
        ).toBeVisible();
        await reasonBox(page).fill(REASON);
        await expect(
          button(
            alertDialogNamed(page, ts.cancelDialog.title),
            ts.cancelDialog.confirm,
          ),
        ).toBeEnabled();
        await snap(
          page,
          info,
          '50-head-recruiter-vacancy-status-cancel-dialog',
          theme,
        );
      });
    });

    test('S6: a cancelled vacancy with the banner and the reason, as built (no clone action)', async ({
      page,
      playwright,
      isMobile,
    }, info) => {
      test.skip(isMobile, DESKTOP_ONLY);
      const open = await fixture(
        page,
        {
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
        },
        'V-0007',
      );
      const admin = await apiAs(playwright, 'admin@demo');
      const cancelled = await statusOf(admin, open.id, {
        action: 'CANCEL',
        reason: CLOSED_REASON,
        expectedVersion: (await detailOf(admin, open.id)).version,
      });
      expect(cancelled.status(), await cancelled.text()).toBe(200);
      await admin.dispose();
      await pinClosedDay(open.id);
      await setTheme(page, 'light');
      await openCard(page, open);
      await expect(chip(page, 'CANCELLED')).toBeVisible();
      await expect(
        page.getByText(/Вакансію скасовано 13\.11\.2026\./),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: tv.draft.cancelReasonTitle }),
      ).toBeVisible();
      await snap(
        page,
        info,
        '50-head-recruiter-vacancy-status-cancelled',
        'light',
      );
    });

    test('S7: a filled vacancy on a phone and the reopen sheet with the headcount raised', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(!isMobile, PHONE_ONLY);
      const filled = await fixture(
        page,
        {
          status: 'FILLED',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
          headcount: 2,
        },
        'V-0003',
      );
      await setTheme(page, 'light');
      await openCard(page, filled);
      await button(page, ts.reopen).click();
      const sheet = dialogNamed(page, ts.reopenDialog.title);
      const field = sheet.getByRole('textbox', {
        name: new RegExp(`^${ts.reopenDialog.headcount}`),
      });
      await expect(field).toHaveValue('2');
      await button(sheet, ts.reopenDialog.increase).click();
      await expect(field).toHaveValue('3');
      await snap(
        page,
        info,
        '50-head-recruiter-vacancy-status-reopen-sheet',
        'light',
      );
    });

    test('S8: «Відкрити вакансію знову?» on a desktop', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(isMobile, DESKTOP_ONLY);
      const filled = await fixture(
        page,
        {
          status: 'FILLED',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
          headcount: 2,
        },
        'V-0003',
      );
      await setTheme(page, 'light');
      await openCard(page, filled);
      await button(page, ts.reopen).click();
      await expect(dialogNamed(page, ts.reopenDialog.title)).toBeVisible();
      await snap(
        page,
        info,
        '50-head-recruiter-vacancy-status-reopen-dialog',
        'light',
      );
    });
  });

  test.describe('Team Lead', () => {
    test.use({ storageState: sessionFile('vasyl.tl@demo') });

    test('S2, S3: the action menu and the cancel sheet with a reason on a phone', async ({
      page,
      isMobile,
    }, info) => {
      test.skip(!isMobile, PHONE_ONLY);
      const own = await fixture(
        page,
        {
          status: 'OPEN',
          teamLead: 'vasyl.tl@demo',
          recruiters: ['recruiter1.gambling@demo'],
        },
        'V-0007',
      );
      await setTheme(page, 'light');
      await openCard(page, own);
      await expect(button(page, ts.hold)).toBeVisible();
      const menu = cardMenu(page, true, own.title);
      await openMenu(menu.trigger, menu.item(ts.cancel));
      await snap(page, info, '50-team-lead-vacancy-status-menu', 'light');

      await menu.item(ts.cancel).click();
      await expect(alertDialogNamed(page, ts.cancelDialog.title)).toBeVisible();
      await reasonBox(page).fill(REASON);
      await snap(
        page,
        info,
        '50-team-lead-vacancy-status-cancel-sheet',
        'light',
      );
    });
  });
});

test.describe('Admin before the 2FA step-up [D63, SHOT-01..03, D125]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // D63 withholds only the Admin grant of a mixed-role user at aal1; a disposable Admin + Recruiter shows it under the seeded Admin name.
  test('S1: on a phone the status and team actions stay visible, disabled, with the reason and «Підтвердити»', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(!isMobile, PHONE_ONLY);
    const target = await fixture(
      page,
      { status: 'OPEN', teamLead: 'vasyl.tl@demo' },
      'V-0007',
    );
    await withIsolatedActor(
      [
        { role: 'ADMIN', verticalId: null },
        { role: 'RECRUITER', verticalId: DEMO_VERTICALS.gambling },
      ],
      async (actor) => {
        await withOwner(
          (sql) => sql`
            update app.app_user set full_name = 'Іван Коваленко'
            where id = ${actor.id} and email = ${actor.email}`,
        );
        await signIn(page.request, actor.email);
        await setTheme(page, 'light');
        await openCard(page, target);
        const verify = page
          .getByRole('link', { name: tv.stepUp.verify, exact: true })
          .first();
        await expect(verify).toBeVisible();
        await expect(verify).toHaveAttribute(
          'href',
          `/mfa/verify?next=${encodeURIComponent(`/vacancies/${target.id}`)}`,
        );
        await expect(
          page.getByText(tv.stepUp.reason, { exact: true }).first(),
        ).toBeVisible();
        await snap(page, info, '50-admin-vacancy-status-step-up', 'light');
      },
    );
  });
});

test.describe('Admin shares a link the clipboard refuses [STORY-UI-09-1, SHOT-01..03, D125]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('U1: the alert under the header holds the full link in a read-only field', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, DESKTOP_ONLY);
    await stage(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await setTheme(page, 'light');
    const target = demoVacancy(5);
    await openHydrated(page, `/vacancies/${target.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: target.title }),
    ).toBeVisible();
    await button(page, tv.share).click();
    const alert = page.getByRole('alert').filter({ hasText: tv.shareFailed });
    await expect(
      alert.getByRole('textbox', { name: tv.shareLinkLabel }),
    ).toHaveValue(`${E2E_ORIGIN}/vacancies/${target.id}`);
    await expect(
      alert.getByRole('button', { name: messages.common.close, exact: true }),
    ).toBeVisible();
    await snap(page, info, '47-admin-vacancy-share-clipboard-blocked', 'light');
  });
});
