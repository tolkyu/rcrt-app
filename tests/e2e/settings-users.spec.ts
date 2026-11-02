import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { userActivationPage } from '../support/user-activation-page';
import { userInvitePage } from '../support/user-invite-page';
import { userRolesPage } from '../support/user-roles-page';

const t = messages.settings.users;
const roles = messages.common.roles;

/** Read-only screen; runs in `e2e-admin-desktop` and `e2e-admin-mobile` after the vertical-mutating specs. */
test.use({ storageState: sessionFile('admin@demo') });

/** Background list refetches can still be inside a mocked route when a test ends. */
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

const rows = (page: Page) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader') });
const cards = (page: Page) =>
  page.getByRole('list', { name: t.caption }).locator('> li');
const listed = (page: Page, isMobile: boolean) =>
  isMobile ? cards(page) : rows(page);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('Admin lands on «Користувачі та ролі»: active first in Ukrainian order, statuses, roles and 2FA [UI-04-1, STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(
    page.getByRole('heading', { level: 1, name: t.title }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: messages.settings.nav.label })
      .getByRole('link', { name: messages.settings.nav.users }),
  ).toHaveAttribute('aria-current', 'page');

  const items = listed(page, isMobile);
  await expect(items.first()).toContainText('Андрій Бондар');
  await expect(items.last()).toContainText('Юлія Петренко');
  await expect(items.last()).toContainText(t.status.DEACTIVATED);
  await expect(items.last()).toContainText(t.deactivatedSuffix);

  const self = items.filter({ hasText: 'admin@demo' });
  await expect(self).toContainText(`Іван Коваленко ${t.you}`);
  await expect(self).toContainText(roles.ADMIN);
  await expect(self).toContainText(t.status.ACTIVE);
  await expect(self).toContainText('1 пристрій');

  const expired = items.filter({ hasText: 'Богдан Поліщук' });
  await expect(expired).toContainText(t.status.INVITE_EXPIRED);
  await expect(expired).toContainText(`${roles.RECRUITER} · Гемблінг`);

  await expect(items.filter({ hasText: 'Василь Мороз' })).toContainText(
    `${roles.TEAM_LEAD} · `,
  );
  await expect(page.getByText(/^Показано 13 з 13$/)).toBeVisible();
});

test('search and filters live in the URL and narrow the list; reset brings everyone back [STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const items = listed(page, isMobile);
  await page.getByLabel(t.searchLabel, { exact: true }).fill('тарас');
  await expect(page).toHaveURL(/q=%D1%82%D0%B0%D1%80%D0%B0%D1%81/);
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('Тарас Лисенко');
  await expect(page.getByText(/^Показано 1 з 1$/)).toBeVisible();

  await page.getByRole('button', { name: t.resetFilters }).click();
  await expect(page.getByLabel(t.searchLabel, { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(items).toHaveCount(13);

  await page
    .getByLabel(t.filterStatus, { exact: true })
    .selectOption('DEACTIVATED');
  await expect(page).toHaveURL(/status=DEACTIVATED/);
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('Юлія Петренко');

  await page.getByLabel(t.filterStatus, { exact: true }).selectOption('');
  await page
    .getByLabel(t.filterVertical, { exact: true })
    .selectOption('GLOBAL');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Іван Коваленко');
  await expect(items.nth(1)).toContainText('Ірина Романенко');

  await page.getByLabel(t.filterVertical, { exact: true }).selectOption('');
  await page.getByLabel(t.searchLabel, { exact: true }).fill('немає-такого');
  await expect(page.getByText(t.empty.title, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(t.searchLabel, { exact: true })).toHaveValue(
    'немає-такого',
  );
  await expect(page.getByText(t.empty.title, { exact: true })).toBeVisible();
});

test('Head Recruiter and Finance get not-found for the users screen, user card and API [VIS-01..03, STORY-ROLE-05-4]', async ({
  browser,
  page: adminPage,
}) => {
  const listing = await adminPage.request.get(
    `/api/v1/users?q=${encodeURIComponent('Василь Мороз')}`,
  );
  expect(listing.status()).toBe(200);
  const { items } = (await listing.json()) as { items: { id: string }[] };
  expect(items).toHaveLength(1);
  const userId = items[0]!.id;
  expect(
    (await adminPage.request.get(`/api/v1/users/${userId}`)).status(),
  ).toBe(200);
  expect(
    (await adminPage.request.get(`/api/v1/users/${userId}/events`)).status(),
  ).toBe(200);
  for (const email of [
    'head.recruiter.gambling@demo',
    'finance@demo',
  ] as const) {
    const context = await browser.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile(email),
    });
    try {
      for (const path of [
        '/api/v1/users',
        `/api/v1/users/${userId}`,
        `/api/v1/users/${userId}/events`,
      ])
        expect((await context.request.get(path)).status(), path).toBe(404);
      const page = await context.newPage();
      for (const path of [
        '/settings/users',
        `/settings/users?user=${userId}`,
      ]) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { name: messages.errors.notFoundTitle }),
        ).toBeVisible();
        await expect(page.getByRole('table')).toHaveCount(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
});

test('captures the users list screenshots with fixed sign-in times [SHOT-01..03]', async ({
  page,
  isMobile,
}, testInfo) => {
  const anchor = Date.parse(FIXED_CLOCK_ISO);
  await page.route('**/api/v1/users?*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      items: { lastLoginAt: string | null }[];
    };
    body.items.forEach((item, index) => {
      if (item.lastLoginAt)
        item.lastLoginAt = new Date(
          anchor - (index + 1) * 3_600_000,
        ).toISOString();
    });
    await route.fulfill({ response, json: body });
  });
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  mkdirSync('screenshots/phase-1', { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/users?status=REVOKED');
    const refetched = page.waitForResponse((response) =>
      response.url().includes('/api/v1/users?'),
    );
    await page.getByLabel(t.filterStatus, { exact: true }).selectOption('');
    await refetched;
    await expect(listed(page, isMobile)).toHaveCount(13);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const file = `08-admin-users-list-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
      scale: 'css',
    });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  }
});

const inviteT = t.inviteDialog;

test('invite dialog validates in place and shows server conflicts with a way to the existing user [STORY-ROLE-05-1]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  await page.getByRole('button', { name: t.invite }).click();
  const dialog = page.getByRole('dialog', { name: inviteT.title });
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole('button', { name: inviteT.submit });
  await submit.click();
  for (const message of [
    inviteT.errors.nameRequired,
    inviteT.errors.emailRequired,
    inviteT.errors.rolesRequired,
  ])
    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
  await expect(dialog.getByLabel(inviteT.nameLabel)).toBeFocused();

  await dialog.getByLabel(inviteT.nameLabel).fill('Андрій Мельник');
  await dialog.getByLabel(inviteT.emailLabel).fill('не-email');
  await dialog.getByLabel(`${roles.RECRUITER} · Гемблінг`).check();
  await expect(
    dialog.getByText(inviteT.errors.rolesRequired, { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog
      .getByRole('complementary')
      .getByText(`${roles.RECRUITER} · Гемблінг`),
  ).toBeVisible();
  await submit.click();
  await expect(dialog.getByText(inviteT.errors.emailInvalid)).toBeVisible();

  const conflicts = [
    ['USER_EXISTS', inviteT.errors.userExists],
    ['INVITE_PENDING', inviteT.errors.invitePending],
    ['USER_DEACTIVATED', inviteT.errors.userDeactivated],
  ] as const;
  let answer = 0;
  await page.route('**/api/v1/invites', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: { code: conflicts[answer++]![0], status: 409, title: 'Conflict' },
    }),
  );
  await dialog
    .getByLabel(inviteT.emailLabel)
    .fill('Yulia.Petrenko@Company.com');
  for (const [, message] of conflicts) {
    await submit.click();
    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
    await expect(dialog.getByLabel(inviteT.emailLabel)).toBeFocused();
  }
  await dialog.getByRole('button', { name: inviteT.errors.showInList }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/q=yulia.petrenko%40company.com/);
  await expect(page.getByLabel(t.searchLabel, { exact: true })).toHaveValue(
    'yulia.petrenko@company.com',
  );
  // `@demo` addresses fail email validation, so the stubbed address matches nobody in the demo list.
  await expect(listed(page, isMobile)).toHaveCount(0);
});

test('a sent invite closes the dialog, confirms with a toast and refreshes the list [STORY-ROLE-05-1]', async ({
  page,
}) => {
  let body: unknown;
  await page.route('**/api/v1/invites', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        userId: '00000000-0000-4000-8000-000000000101',
        inviteId: '00000000-0000-4000-8000-000000000102',
        expiresAt: '2026-11-19T08:00:00.000Z',
        delivered: true,
      },
    });
  });
  await page.goto('/settings/users');
  await page.getByRole('button', { name: t.invite }).click();
  const dialog = page.getByRole('dialog', { name: inviteT.title });
  await dialog.getByLabel(inviteT.nameLabel).fill('  Андрій   Мельник ');
  await dialog.getByLabel(inviteT.emailLabel).fill('Andrii.Melnyk@Company.com');
  await dialog.getByLabel(`${roles.TEAM_LEAD} · Крипто`).check();
  await dialog
    .getByLabel(`${roles.ADMIN} · ${t.roleMatrix.allVerticals}`)
    .check();
  await expect(dialog.getByText(inviteT.summaryMfa)).toBeVisible();
  const refetch = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v1/users',
  );
  await dialog.getByRole('button', { name: inviteT.submit }).click();
  await expect(dialog).toHaveCount(0);
  await refetch;
  await expect(
    page.getByText(
      /^Запрошення надіслано · andrii\.melnyk@company\.com · діє до /,
    ),
  ).toBeVisible();
  expect(body).toMatchObject({
    fullName: '  Андрій   Мельник ',
    email: 'Andrii.Melnyk@Company.com',
    roles: [
      { role: 'ADMIN', verticalId: null },
      {
        role: 'TEAM_LEAD',
        verticalId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    ],
  });
});

test('invite dialog: undelivered letter, server-rejected roles, long name, and closing without sending [STORY-ROLE-05-1]', async ({
  page,
}) => {
  const answers = [
    {
      status: 400,
      contentType: 'application/problem+json',
      json: {
        code: 'VALIDATION_FAILED',
        status: 400,
        errors: [{ path: 'body.roles', code: 'invalid_roles' }],
      },
    },
    {
      status: 201,
      json: {
        userId: '00000000-0000-4000-8000-000000000103',
        inviteId: '00000000-0000-4000-8000-000000000104',
        expiresAt: '2026-11-19T08:00:00.000Z',
        delivered: false,
      },
    },
  ];
  let requests = 0;
  await page.route('**/api/v1/invites', (route) =>
    route.fulfill(answers[requests++]!),
  );
  await page.goto('/settings/users');
  const dialog = page.getByRole('dialog', { name: inviteT.title });
  const open = () => page.getByRole('button', { name: t.invite }).click();

  await open();
  await dialog.getByLabel(inviteT.nameLabel).fill('Андрій');
  await dialog
    .getByRole('button', { name: messages.settings.common.cancel })
    .click();
  await expect(dialog).toHaveCount(0);
  await open();
  await expect(dialog.getByLabel(inviteT.nameLabel)).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(requests).toBe(0);

  await open();
  await dialog.getByLabel(inviteT.nameLabel).fill('Я'.repeat(121));
  await dialog.getByLabel(inviteT.emailLabel).fill('long@company.com');
  await dialog.getByLabel(`${roles.HR} · Крипто`).check();
  await dialog.getByRole('button', { name: inviteT.submit }).click();
  await expect(
    dialog.getByText(inviteT.errors.nameTooLong.replace('{max}', '120'), {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toBe(0);

  await dialog.getByLabel(inviteT.nameLabel).fill('Андрій Мельник');
  await dialog.getByRole('button', { name: inviteT.submit }).click();
  await expect(
    dialog.getByText(inviteT.errors.rolesInvalid, { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: inviteT.submit }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(inviteT.toastNotDelivered, { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
});

test('captures the invite dialog screenshots [SHOT-01..03]', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/users?status=REVOKED');
    await page.getByRole('button', { name: t.invite }).click();
    const dialog = page.getByRole('dialog', { name: inviteT.title });
    await dialog.getByLabel(inviteT.nameLabel).fill('Андрій Мельник');
    await dialog
      .getByLabel(inviteT.emailLabel)
      .fill('andrii.melnyk@company.com');
    await dialog.getByLabel(`${roles.RECRUITER} · Гемблінг`).check();
    await dialog.getByLabel(`${roles.RECRUITER} · Крипто`).check();
    await dialog.getByLabel(`${roles.TEAM_LEAD} · Гемблінг`).check();
    await page.evaluate(() => document.fonts.ready);
    const file = `09-admin-invite-dialog-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({ path, animations: 'disabled', scale: 'css' });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  }
});

const drawerT = t.drawer;
const drawer = (page: Page) => page.getByRole('dialog');
const listedUser = (page: Page, isMobile: boolean, name: string) =>
  listed(page, isMobile).filter({ hasText: name });
const userIdOf = async (page: Page, isMobile: boolean, name: string) => {
  const id = await listedUser(page, isMobile, name)
    .getByRole('button')
    .getAttribute('data-user-id');
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id!;
};
const withUser = (id: string) => new RegExp(`[?&]user=${id}(&|$)`);
test('user card opens by click and by Enter, lives in ?user=, closes with Esc, Back and «×» and returns focus to the row [STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const row = listedUser(page, isMobile, 'Василь Мороз');
  const opener = row.getByRole('button');
  const id = await userIdOf(page, isMobile, 'Василь Мороз');
  const card = drawer(page);
  const title = card.getByRole('heading', { name: 'Василь Мороз' });

  await row.click();
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(withUser(id));
  await expect(title).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(opener).toBeFocused();

  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(withUser(id));
  await page.goBack();
  await expect(card).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(opener).toBeFocused();

  await page.getByLabel(t.filterStatus, { exact: true }).selectOption('ACTIVE');
  await expect(page).toHaveURL(/status=ACTIVE/);
  await row.click();
  await expect(page).toHaveURL(withUser(id));
  await expect(page).toHaveURL(/status=ACTIVE/);
  await card.getByRole('button', { name: drawerT.close }).click();
  await expect(card).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/users\?status=ACTIVE$/);
  await expect(opener).toBeFocused();
});

test('a deep link opens the card on load with the heading focused; Esc focuses the user row [STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const id = await userIdOf(page, isMobile, 'Василь Мороз');
  await page.goto(`/settings/users?user=${id}`);
  const card = drawer(page);
  await expect(
    card.getByRole('heading', { name: 'Василь Мороз' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(
    listedUser(page, isMobile, 'Василь Мороз').getByRole('button'),
  ).toBeFocused();
});

test('Team Lead card: roles with «Змінити ролі», TL priority, sign-in security and the audit link [STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const id = await userIdOf(page, isMobile, 'Василь Мороз');
  await listedUser(page, isMobile, 'Василь Мороз').click();
  const card = drawer(page);
  await expect(card.getByText('vasyl.tl@demo', { exact: true })).toBeVisible();
  await expect(card.getByText(t.status.ACTIVE, { exact: true })).toBeVisible();
  await expect(
    card.getByRole('tab', { name: drawerT.tabProfile }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    card.getByRole('heading', { name: drawerT.rolesTitle }),
  ).toBeVisible();
  await expect(
    card.getByText(`${roles.TEAM_LEAD} · Гемблінг`, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', { name: drawerT.priorityTitle }),
  ).toBeVisible();
  await expect(card.getByText('Гемблінг: П0', { exact: true })).toBeVisible();
  await expect(
    card.getByRole('heading', { name: drawerT.securityTitle }),
  ).toBeVisible();
  await expect(
    card.getByText(drawerT.mfaOptionalRole, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', { name: drawerT.inviteTitle }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('link', { name: drawerT.auditLink }),
  ).toHaveAttribute(
    'href',
    `/settings/audit?entityType=user&entityId=${id}&period=365d`,
  );
  await expect(card.getByRole('tab')).toHaveCount(2);
  await expect(card.getByRole('button')).toHaveCount(3);
  await expect(
    card.getByRole('button', { name: drawerT.activation.deactivate }),
  ).toBeVisible();
  await expect(card.getByRole('button', { name: drawerT.close })).toBeVisible();
  await expect(
    card.getByRole('button', { name: drawerT.editRoles }),
  ).toBeVisible();
});

test('expired invitee card shows the invitation block and no sign-in security [STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  await listedUser(page, isMobile, 'Богдан Поліщук').click();
  const card = drawer(page);
  await expect(
    card.getByRole('heading', { name: 'Богдан Поліщук' }),
  ).toBeVisible();
  await expect(
    card.getByText(t.status.INVITE_EXPIRED, { exact: true }),
  ).toBeVisible();
  await expect(card.getByText(t.lastLoginNever, { exact: true })).toBeVisible();
  await expect(
    card.getByText(`${roles.RECRUITER} · Гемблінг`, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', { name: drawerT.inviteTitle }),
  ).toBeVisible();
  await expect(
    card.getByText('Надіслано: 10.01.2020, 10:00', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    card.getByText('Прострочене з 13.01.2020, 10:00', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    card.getByText('Надсилалося повторно: 0', { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', { name: drawerT.securityTitle }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('heading', { name: drawerT.priorityTitle }),
  ).toHaveCount(0);
});

test('deactivated and self cards: «(деактивовано)» with inactive roles; «(ви)» with own 2FA devices [STORY-ROLE-05-4]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const card = drawer(page);
  await listedUser(page, isMobile, 'Юлія Петренко').click();
  await expect(
    card.getByRole('heading', {
      name: `Юлія Петренко ${t.deactivatedSuffix}`,
    }),
  ).toBeVisible();
  await expect(
    card.getByText('inactive.recruiter@demo', { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText(t.status.DEACTIVATED, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText(`${roles.RECRUITER} · Гемблінг`, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText(drawerT.rolesInactive, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: drawerT.editRoles }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('heading', { name: drawerT.securityTitle }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('heading', { name: drawerT.inviteTitle }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  await listedUser(page, isMobile, 'admin@demo').click();
  await expect(
    card.getByRole('heading', { name: `Іван Коваленко ${t.you}` }),
  ).toBeVisible();
  await expect(card.getByText(roles.ADMIN, { exact: true })).toBeVisible();
  await expect(
    card.getByText(/^Останній вхід: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', { name: drawerT.securityTitle }),
  ).toBeVisible();
  await expect(card.getByText('1 пристрій', { exact: true })).toBeVisible();
  await expect(
    card.getByText(drawerT.mfaRequiredRole, { exact: true }),
  ).toBeVisible();
});

test('«Історія» lists the user timeline newest first and pages by cursor with «Показати ще» [STORY-ROLE-05-4, HIST-03]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const id = await userIdOf(page, isMobile, 'Юлія Петренко');
  const full = await page.request.get(`/api/v1/users/${id}/events`);
  expect(full.status()).toBe(200);
  const timeline = (await full.json()) as {
    items: { type: string; occurredAt: string }[];
    nextCursor: string | null;
  };
  expect(timeline.nextCursor).toBeNull();
  const types = timeline.items.map((event) => event.type);
  expect(types.at(-1)).toBe('user.invited');
  expect(types).toContain('user.deactivated');

  const requested: string[] = [];
  await page.route(
    (url) => url.pathname === `/api/v1/users/${id}/events`,
    (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '1');
      requested.push(url.search);
      return route.continue({ url: url.toString() });
    },
  );
  await listedUser(page, isMobile, 'Юлія Петренко').click();
  const card = drawer(page);
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  const events = card
    .getByRole('list', { name: drawerT.historyTitle })
    .locator('> li');
  const more = card.getByRole('button', { name: t.loadMore });
  const action = messages.settings.audit.actions.user;
  await expect(events).toHaveCount(1);
  await expect(events.nth(0)).toContainText(messages.settings.audit.system);
  const time = events.nth(0).locator('time');
  await expect(time).toHaveAttribute('datetime', timeline.items[0]!.occurredAt);
  await expect(time).toHaveText('16.11.2026, 10:00');
  for (let shown = 1; shown < types.length; shown++) {
    await expect(more).toBeVisible();
    await more.click();
    await expect(events).toHaveCount(shown + 1);
  }
  await expect(more).toHaveCount(0);
  await expect(events.last()).toContainText(action.invited);
  await expect(events.filter({ hasText: action.deactivated })).toHaveCount(1);
  expect(requested).toHaveLength(types.length);
  expect(requested[0]).toBe('?limit=1');
  for (const search of requested.slice(1))
    expect(search).toMatch(/^\?cursor=[^&]+&limit=1$/);

  await card.getByRole('tab', { name: drawerT.tabProfile }).click();
  await expect(
    card.getByText(drawerT.rolesInactive, { exact: true }),
  ).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  await expect(events).toHaveCount(types.length);
  expect(requested).toHaveLength(types.length);
});

test('an unknown ?user= shows the not-found state inside the card [STORY-ROLE-05-4]', async ({
  page,
}) => {
  const unknown = '00000000-0000-4000-8000-000000000999';
  for (const path of [
    `/api/v1/users/${unknown}`,
    `/api/v1/users/${unknown}/events`,
  ])
    expect((await page.request.get(path)).status(), path).toBe(404);
  await page.goto(`/settings/users?user=${unknown}`);
  const card = page.getByRole('dialog', { name: drawerT.title });
  await expect(card.getByText(drawerT.notFound, { exact: true })).toBeVisible();
  await expect(card.getByRole('tab')).toHaveCount(0);
  await expect(card.getByRole('link')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/users$/);
});

test('invitation actions update the card, list and cached history; confirmations protect cancellation and focus [STORY-ROLE-05-3, D70]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page);
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, fixture.detail.fullName).click();
  const card = drawer(page);
  const actions = card.getByRole('group', { name: drawerT.actionsLabel });
  await expect(
    actions.getByRole('button', { name: drawerT.resend, exact: true }),
  ).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  const history = card.getByRole('list', { name: drawerT.historyTitle });
  await expect(
    history.getByText(messages.settings.audit.actions.user.invited, {
      exact: true,
    }),
  ).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabProfile }).click();
  await actions
    .getByRole('button', { name: drawerT.resend, exact: true })
    .click();
  await expect(card.getByText(t.status.INVITED, { exact: true })).toBeVisible();
  await expect(
    card.getByText('Надсилалося повторно: 1', { exact: true }),
  ).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  await expect(
    history.getByText(messages.settings.audit.actions.user.invite_resent, {
      exact: true,
    }),
  ).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabProfile }).click();

  const revoke = actions.getByRole('button', {
    name: drawerT.revoke,
    exact: true,
  });
  await revoke.click();
  const confirm = page.getByRole('alertdialog');
  const cancel = confirm.getByRole('button', {
    name: messages.settings.common.cancel,
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(revoke).toBeFocused();
  expect(fixture.posts).toHaveLength(1);

  const release = deferred();
  const received = deferred();
  await page.route(
    `**/api/v1/users/${fixture.detail.id}/invite/revoke`,
    async (route) => {
      received.resolve();
      await release.promise;
      await route.fallback();
    },
  );
  try {
    await revoke.click();
    await confirm
      .getByRole('button', { name: drawerT.revokeDialog.submit, exact: true })
      .click();
    await received.promise;
    await expect(cancel).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();
    release.resolve();
    await expect(confirm).toHaveCount(0);
    await expect(
      card.getByText(t.status.REVOKED, { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole('heading', { name: fixture.detail.fullName }),
    ).toBeFocused();
  } finally {
    release.resolve();
  }
  await card.getByRole('button', { name: drawerT.close }).click();
  await expect(card).toHaveCount(0);
  await expect(
    listedUser(page, isMobile, fixture.detail.fullName),
  ).toContainText(t.status.REVOKED);
  await listedUser(page, isMobile, fixture.detail.fullName).click();
  await actions
    .getByRole('button', { name: drawerT.reinvite, exact: true })
    .click();
  await expect(confirm).toContainText(fixture.detail.email);
  await expect(confirm).toContainText(`${roles.RECRUITER} · Гемблінг`);
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(card).toBeVisible();
  const reinvite = actions.getByRole('button', {
    name: drawerT.reinvite,
    exact: true,
  });
  await expect(reinvite).toBeFocused();
  expect(fixture.posts).toHaveLength(2);
  await reinvite.click();
  await confirm
    .getByRole('button', { name: drawerT.reinviteDialog.submit, exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
  await expect(card.getByText(t.status.INVITED, { exact: true })).toBeVisible();
  await expect(
    card.getByRole('heading', { name: fixture.detail.fullName }),
  ).toBeFocused();
  expect(fixture.posts.map((path) => path.split('/').at(-1))).toEqual([
    'resend',
    'revoke',
    'invite',
  ]);
});

test('undelivered resend warns that the old link is invalid; a stale invite refreshes to active without actions [STORY-ROLE-05-3]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page, { delivered: false });
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, fixture.detail.fullName).click();
  const card = drawer(page);
  await card.getByRole('button', { name: drawerT.resend, exact: true }).click();
  await expect(
    page.getByText(drawerT.resendNotDelivered, { exact: true }),
  ).toBeVisible();
  await expect(card.getByText(t.status.INVITED, { exact: true })).toBeVisible();
  await page.route(
    `**/api/v1/users/${fixture.detail.id}/invite/revoke`,
    async (route) => {
      fixture.detail.status = 'ACTIVE';
      fixture.detail.activatedAt = FIXED_CLOCK_ISO;
      fixture.detail.invitation = null;
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'INVITE_NOT_PENDING', status: 409 },
      });
    },
  );
  await card.getByRole('button', { name: drawerT.revoke, exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: drawerT.revokeDialog.submit, exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(
    page.getByText(messages.settings.common.conflict, { exact: true }),
  ).toBeVisible();
  await expect(card.getByText(t.status.ACTIVE, { exact: true })).toBeVisible();
  await expect(
    card.getByRole('group', { name: drawerT.actionsLabel }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('heading', { name: fixture.detail.fullName }),
  ).toBeFocused();
});

test('an invitee without roles can revoke but cannot receive another link [ROLE-05-2]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page, { noRoles: true });
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, fixture.detail.fullName).click();
  const card = drawer(page);
  await expect(
    card.getByRole('button', { name: drawerT.resend, exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole('button', { name: drawerT.revoke, exact: true }),
  ).toBeEnabled();
  await expect(
    card.getByText(drawerT.noRolesReason, { exact: true }),
  ).toBeVisible();
  expect(fixture.posts).toHaveLength(0);
  await card.getByRole('button', { name: drawerT.revoke, exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: drawerT.revokeDialog.submit, exact: true })
    .click();
  await expect(card.getByText(t.status.REVOKED, { exact: true })).toBeVisible();
  await expect(
    card.getByRole('button', { name: drawerT.reinvite, exact: true }),
  ).toBeDisabled();
  expect(fixture.posts).toEqual([
    `/api/v1/users/${fixture.detail.id}/invite/revoke`,
  ]);
});

const changeT = drawerT.changeEmail;
const userCard = (page: Page, name: string) =>
  page.getByRole('dialog', { name, exact: true });
const changeDialog = (page: Page, name: string) =>
  page.getByRole('dialog', { name: changeT.title.replace('{name}', name) });

async function openChangeEmail(page: Page, name: string) {
  await userCard(page, name)
    .getByRole('button', { name: drawerT.moreActions })
    .click();
  await page.getByRole('menuitem', { name: changeT.menuItem }).click();
  const dialog = changeDialog(page, name);
  await expect(dialog).toBeVisible();
  return dialog;
}

test('change email: «⋯» waits for invite actions, the dialog starts on the selected address, Escape closes only it, success updates card and history [STORY-ROLE-05-7]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page);
  const name = fixture.detail.fullName;
  const original = fixture.detail.email;
  const next = 'bohdan.polishchuk@company.com';
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, name).click();
  const card = userCard(page, name);
  const more = card.getByRole('button', { name: drawerT.moreActions });
  await expect(more).toBeEnabled();

  const release = deferred();
  const received = deferred();
  await page.route(
    `**/api/v1/users/${fixture.detail.id}/invite/resend`,
    async (route) => {
      received.resolve();
      await release.promise;
      await route.fallback();
    },
  );
  try {
    await card
      .getByRole('button', { name: drawerT.resend, exact: true })
      .click();
    await received.promise;
    await expect(more).toBeDisabled();
  } finally {
    release.resolve();
  }
  await expect(more).toBeEnabled();

  let dialog = await openChangeEmail(page, name);
  const input = dialog.getByLabel(changeT.newLabel);
  const submit = dialog.getByRole('button', { name: changeT.submit });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(original);
  await expect(dialog.getByText(original, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(`Ролі після прийняття: ${roles.RECRUITER} · Гемблінг`),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(dialog.getByText(changeT.errors.unchanged)).toHaveCount(0);
  await page.keyboard.type('x');
  await expect(input).toHaveValue('x');
  await input.fill(` ${original.toUpperCase()} `);
  await expect(
    dialog.getByText(changeT.errors.unchanged, { exact: true }),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(more).toBeFocused();
  expect(fixture.emails).toEqual([]);

  dialog = await openChangeEmail(page, name);
  await dialog.getByLabel(changeT.newLabel).fill('не-адреса');
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(
    dialog.getByText(t.inviteDialog.errors.emailInvalid, { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel(changeT.newLabel).fill(` ${next.toUpperCase()} `);
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(
      `Email змінено. Запрошення надіслано на ${next} · діє до 19.11.2026, 10:00`,
      { exact: true },
    ),
  ).toBeVisible();
  expect(fixture.emails).toEqual([next]);
  await expect(card.getByRole('heading', { name })).toBeFocused();
  await expect(card.getByText(next, { exact: true })).toBeVisible();
  await expect(card.getByText(t.status.INVITED, { exact: true })).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  await expect(
    card
      .getByRole('list', { name: drawerT.historyTitle })
      .getByText(messages.settings.audit.actions.user.email_changed, {
        exact: true,
      }),
  ).toBeVisible();
});

test('change email: an address held by someone else stays in the dialog with «Показати в списку»; a state conflict closes and refreshes [STORY-ROLE-05-7]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page);
  const name = fixture.detail.fullName;
  let answer: { code: string; field: boolean } = {
    code: 'USER_EXISTS',
    field: true,
  };
  await page.route(`**/api/v1/users/${fixture.detail.id}/email`, (route) => {
    if (!answer.field) {
      fixture.detail.status = 'ACTIVE';
      fixture.detail.activatedAt = FIXED_CLOCK_ISO;
      fixture.detail.invitation = null;
    }
    return route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        status: 409,
        code: answer.code,
        ...(answer.field
          ? { errors: [{ path: 'body.email', code: 'taken' }] }
          : {}),
      },
    });
  });
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, name).click();
  let dialog = await openChangeEmail(page, name);
  const input = dialog.getByLabel(changeT.newLabel);
  await input.fill('Olena.Taken@Company.com');
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(
    dialog.getByText(t.inviteDialog.errors.userExists, { exact: true }),
  ).toBeVisible();
  await expect(input).toBeFocused();
  answer = { code: 'USER_DEACTIVATED', field: true };
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(
    dialog.getByText(t.inviteDialog.errors.userDeactivated, { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: t.inviteDialog.errors.showInList })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/q=olena.taken%40company.com/);
  await expect(page).not.toHaveURL(/user=/);
  await expect(page.getByLabel(t.searchLabel, { exact: true })).toBeFocused();

  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, name).click();
  answer = { code: 'USER_ACTIVATED', field: false };
  dialog = await openChangeEmail(page, name);
  await dialog.getByLabel(changeT.newLabel).fill('olena.free@company.com');
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(messages.settings.common.conflict, { exact: true }),
  ).toBeVisible();
  const card = userCard(page, name);
  await expect(card.getByText(t.status.ACTIVE, { exact: true })).toBeVisible();
  await expect(
    card.getByRole('button', { name: drawerT.moreActions }),
  ).toHaveCount(0);
  await expect(card.getByRole('heading', { name })).toBeFocused();
});

test('change email: a revoked card offers «⋯»; a server error keeps the typed address; an undelivered letter warns; active cards have no «⋯» [STORY-ROLE-05-7]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page, { delivered: false });
  const name = fixture.detail.fullName;
  fixture.detail.status = 'REVOKED';
  fixture.detail.invitation!.revokedAt = FIXED_CLOCK_ISO;
  const next = 'bohdan.new@company.com';
  let failNext = true;
  await page.route(`**/api/v1/users/${fixture.detail.id}/email`, (route) => {
    if (!failNext) return route.fallback();
    failNext = false;
    return route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      json: { status: 500, code: 'INTERNAL' },
    });
  });
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, name).click();
  const card = userCard(page, name);
  await expect(card.getByText(t.status.REVOKED, { exact: true })).toBeVisible();
  const dialog = await openChangeEmail(page, name);
  await dialog.getByLabel(changeT.newLabel).fill(next);
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(
    page.getByText(messages.settings.common.saveFailed, { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(changeT.newLabel)).toHaveValue(next);
  expect(fixture.emails).toEqual([]);
  await dialog.getByRole('button', { name: changeT.submit }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(changeT.notDelivered, { exact: true }),
  ).toBeVisible();
  expect(fixture.emails).toEqual([next]);
  await expect(card.getByText(t.status.INVITED, { exact: true })).toBeVisible();
  await expect(card.getByText(next, { exact: true })).toBeVisible();

  await page.goto('/settings/users?q=Василь');
  await listedUser(page, isMobile, 'Василь Мороз').click();
  const active = userCard(page, 'Василь Мороз');
  await expect(
    active.getByText(t.status.ACTIVE, { exact: true }),
  ).toBeVisible();
  // Security renders from the loaded detail, the same data the «⋯» waits for.
  await expect(
    active.getByRole('heading', { name: drawerT.securityTitle }),
  ).toBeVisible();
  await expect(
    active.getByRole('button', { name: drawerT.moreActions }),
  ).toHaveCount(0);
});

test('change email: without roles the item stays readable but inert, with the reason [STORY-ROLE-05-7, ROLE-05-2]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userInvitePage(page, { noRoles: true });
  const name = fixture.detail.fullName;
  await page.goto('/settings/users?q=Богдан');
  await listedUser(page, isMobile, name).click();
  await userCard(page, name)
    .getByRole('button', { name: drawerT.moreActions })
    .click();
  const item = page.getByRole('menuitem', {
    name: changeT.menuItem,
    exact: true,
  });
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await expect(item).toHaveAccessibleDescription(drawerT.noRolesReason);
  // Playwright treats aria-disabled as not actionable; force is the mouse user's real click.
  await item.click({ force: true });
  await page.keyboard.press('ArrowDown');
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(item).toBeVisible();
  await expect(changeDialog(page, name)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(item).toHaveCount(0);
  await expect(userCard(page, name)).toBeVisible();
  expect(fixture.emails).toEqual([]);
});

const rolesT = drawerT.rolesDialog;
const matrixT = t.roleMatrix;
const rolesDialog = (page: Page, name: string) =>
  page.getByRole('dialog', { name: rolesT.title.replace('{name}', name) });
const problem = (status: number, code: string) => ({
  status,
  contentType: 'application/problem+json',
  json: { status, code, title: code, type: 'about:blank' },
});

async function openRoles(page: Page, isMobile: boolean, name: string) {
  await page.goto(`/settings/users?q=${encodeURIComponent(name)}`);
  await listedUser(page, isMobile, name).click();
  const card = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: drawerT.close, exact: true }),
  });
  const trigger = card.getByRole('button', { name: drawerT.editRoles });
  await trigger.click();
  const dialog = rolesDialog(page, name);
  await expect(dialog).toBeVisible();
  return { card, trigger, dialog };
}

test('change roles: prefilled matrix, live «Буде додано», Escape closes only the dialog, adds save without confirmation [STORY-ROLE-01-1]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userRolesPage(page, 'Василь Мороз');
  const crypto = fixture.verticalId('Крипто');
  const gambling = fixture.verticalId('Гемблінг');
  const { card, trigger, dialog } = await openRoles(
    page,
    isMobile,
    'Василь Мороз',
  );
  const lead = dialog.getByLabel(`${roles.TEAM_LEAD} · Гемблінг`, {
    exact: true,
  });
  const submit = dialog.getByRole('button', { name: rolesT.submit });
  await expect(dialog.getByText(rolesT.description)).toBeVisible();
  await expect(lead).toBeChecked();
  await expect(
    dialog.getByLabel(`${roles.ADMIN} · ${matrixT.allVerticals}`),
  ).not.toBeChecked();
  await expect(dialog.getByText(rolesT.noChanges)).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  const recruiter = dialog.getByLabel(`${roles.RECRUITER} · Крипто`, {
    exact: true,
  });
  await recruiter.check();
  await expect(dialog.getByText(rolesT.added, { exact: true })).toBeVisible();
  await expect(
    dialog
      .getByRole('listitem')
      .filter({ hasText: `${roles.RECRUITER} · Крипто` }),
  ).toBeVisible();
  await expect(dialog.getByText(rolesT.removed, { exact: true })).toHaveCount(
    0,
  );
  await recruiter.uncheck();
  await expect(submit).toBeDisabled();
  await recruiter.check();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText(rolesT.toast, { exact: true })).toBeVisible();
  expect(fixture.saves).toHaveLength(1);
  expect(fixture.saves[0]!.expectedVersion).toBe(fixture.detail.version - 1);
  expect(fixture.saves[0]!.roles).toHaveLength(2);
  expect(fixture.saves[0]!.roles).toEqual(
    expect.arrayContaining([
      { role: 'TEAM_LEAD', verticalId: gambling },
      { role: 'RECRUITER', verticalId: crypto },
    ]),
  );
  await expect(
    card.getByRole('heading', { name: 'Василь Мороз' }),
  ).toBeFocused();
  await expect(
    card.getByText(`${roles.RECRUITER} · Крипто`, { exact: true }),
  ).toBeVisible();
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  await expect(
    card
      .getByRole('list', { name: drawerT.historyTitle })
      .getByText(messages.settings.audit.actions.user.role_assigned, {
        exact: true,
      }),
  ).toBeVisible();
});

test('change roles: removals need «Зняти ролі?»; cancelling returns to the dialog; no roles left warns [STORY-ROLE-01-2]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userRolesPage(page, 'Василь Мороз');
  const { card, dialog } = await openRoles(page, isMobile, 'Василь Мороз');
  const submit = dialog.getByRole('button', { name: rolesT.submit });
  await dialog
    .getByLabel(`${roles.TEAM_LEAD} · Гемблінг`, { exact: true })
    .uncheck();
  await expect(dialog.getByText(rolesT.removed, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(rolesT.lastRoleWarning, { exact: true }),
  ).toBeVisible();
  await submit.click();
  const confirm = page.getByRole('alertdialog', { name: rolesT.confirmTitle });
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByText(rolesT.confirmBody.replace('{name}', 'Василь Мороз')),
  ).toBeVisible();
  await expect(
    confirm.getByText(`${roles.TEAM_LEAD} · Гемблінг`, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(submit).toBeFocused();
  expect(fixture.saves).toEqual([]);

  await submit.click();
  await confirm
    .getByRole('button', { name: messages.settings.common.cancel })
    .click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await submit.click();
  await confirm.getByRole('button', { name: rolesT.confirmSubmit }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.saves.map((save) => save.roles)).toEqual([[]]);
  await expect(card.getByText(drawerT.noRoles, { exact: true })).toBeVisible();
  await expect(
    card.getByRole('heading', { name: 'Василь Мороз' }),
  ).toBeFocused();
});

test('change roles: own card locks ADMIN with the reason; so does the last Admin; an invitee without roles is warned [D45, ROLE-05-2]', async ({
  page,
  isMobile,
}) => {
  const self = await openRoles(page, isMobile, 'Іван Коваленко');
  const adminCell = self.dialog.getByLabel(
    `${roles.ADMIN} · ${matrixT.allVerticals}`,
  );
  await expect(adminCell).toBeChecked();
  await expect(adminCell).toHaveAttribute('aria-disabled', 'true');
  await expect(adminCell).toHaveAccessibleDescription(matrixT.selfAdminLocked);
  await adminCell.click({ force: true });
  await expect(adminCell).toBeChecked();
  await expect(
    self.dialog.getByRole('button', { name: rolesT.submit }),
  ).toBeDisabled();
  await self.dialog
    .getByRole('button', { name: messages.settings.common.cancel })
    .click();
  await expect(self.dialog).toHaveCount(0);
  await expect(self.trigger).toBeFocused();

  await userRolesPage(page, 'Василь Мороз', (detail) => {
    detail.roles = [...detail.roles, { role: 'ADMIN', vertical: null }];
    detail.lastActiveAdmin = true;
  });
  const last = await openRoles(page, isMobile, 'Василь Мороз');
  await expect(
    last.dialog.getByLabel(`${roles.ADMIN} · ${matrixT.allVerticals}`),
  ).toHaveAccessibleDescription(matrixT.lastAdminLocked);
  await page.keyboard.press('Escape');
  await expect(last.dialog).toHaveCount(0);

  const invite = await userInvitePage(page);
  const invited = await openRoles(page, isMobile, invite.detail.fullName);
  await invited.dialog
    .getByLabel(`${roles.RECRUITER} · Гемблінг`, { exact: true })
    .uncheck();
  await expect(
    invited.dialog.getByText(rolesT.invitedNoRoles, { exact: true }),
  ).toBeVisible();
  await expect(invited.dialog.getByText(rolesT.lastRoleWarning)).toHaveCount(0);
});

test('change roles: a server error keeps the selection; a version conflict or D45 refusal closes, rolls the card back and refreshes [ADR-006, D45]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userRolesPage(page, 'Василь Мороз');
  const first = await openRoles(page, isMobile, 'Василь Мороз');
  const recruiter = first.dialog.getByLabel(`${roles.RECRUITER} · Крипто`, {
    exact: true,
  });
  fixture.answerNextSave(problem(400, 'VALIDATION_FAILED'));
  await recruiter.check();
  await first.dialog.getByRole('button', { name: rolesT.submit }).click();
  await expect(first.dialog.getByRole('alert')).toHaveText(
    rolesT.errors.rolesInvalid,
  );
  await expect(recruiter).toBeChecked();
  await recruiter.uncheck();
  await expect(first.dialog.getByRole('alert')).toHaveCount(0);
  await recruiter.check();
  fixture.answerNextSave(problem(500, 'INTERNAL'));
  await first.dialog.getByRole('button', { name: rolesT.submit }).click();
  await expect(
    page.getByText(messages.settings.common.saveFailed, { exact: true }),
  ).toBeVisible();
  await expect(first.dialog).toBeVisible();
  await expect(recruiter).toBeChecked();

  fixture.answerNextSave(problem(409, 'STALE_STATE'));
  await first.dialog.getByRole('button', { name: rolesT.submit }).click();
  await expect(first.dialog).toHaveCount(0);
  await expect(
    page.getByText(messages.settings.common.conflict, { exact: true }),
  ).toBeVisible();
  await expect(
    first.card.getByRole('heading', { name: 'Василь Мороз' }),
  ).toBeFocused();
  await expect(
    first.card.getByText(`${roles.RECRUITER} · Крипто`, { exact: true }),
  ).toHaveCount(0);
  expect(fixture.saves).toHaveLength(3);

  await first.trigger.click();
  fixture.answerNextSave(problem(409, 'LAST_ADMIN'));
  await first.dialog
    .getByLabel(`${roles.HR} · Крипто`, { exact: true })
    .check();
  await first.dialog.getByRole('button', { name: rolesT.submit }).click();
  await expect(
    page.getByText(rolesT.errors.lastAdmin, { exact: true }),
  ).toBeVisible();
  await expect(first.dialog).toHaveCount(0);
});

test('change roles: pending additions appear in the users list and a failed save rolls them back [ADR-006, STORY-ROLE-01-1]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userRolesPage(page, 'Василь Мороз');
  const { dialog } = await openRoles(page, isMobile, 'Василь Мороз');
  const listEntry = isMobile
    ? page
        .getByRole('list', { name: t.caption, includeHidden: true })
        .locator('> li')
        .filter({ hasText: 'Василь Мороз' })
    : page.locator('tbody tr').filter({ hasText: 'Василь Мороз' });
  const originalRole = `${roles.TEAM_LEAD} · Гемблінг`;
  const addedRole = `${roles.RECRUITER} · Крипто`;
  const pause = fixture.pauseNextSave();
  fixture.answerNextSave(problem(500, 'INTERNAL'));
  await dialog.getByLabel(addedRole, { exact: true }).check();
  await dialog.getByRole('button', { name: rolesT.submit }).click();
  await pause.started;
  try {
    await expect(listEntry).toContainText(originalRole);
    await expect(listEntry).toContainText(addedRole);
    await expect(
      dialog.getByRole('button', { name: messages.settings.common.saving }),
    ).toBeDisabled();
  } finally {
    pause.release();
  }
  await expect(
    page.getByText(messages.settings.common.saveFailed, { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(addedRole, { exact: true })).toBeChecked();
  await expect(listEntry).toContainText(originalRole);
  await expect(listEntry).not.toContainText(addedRole);
});

const activationT = drawerT.activation;
const userCardDialog = (page: Page) =>
  page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: drawerT.close, exact: true }),
  });
const deactivateDialog = (page: Page, name: string) =>
  page.getByRole('alertdialog', {
    name: activationT.deactivateTitle.replace('{name}', name),
  });
const reactivateDialog = (page: Page, name: string) =>
  page.getByRole('dialog', {
    name: activationT.reactivateTitle.replace('{name}', name),
  });

async function openCard(page: Page, isMobile: boolean, name: string) {
  await page.goto(`/settings/users?q=${encodeURIComponent(name)}`);
  await listedUser(page, isMobile, name).click();
  const card = userCardDialog(page);
  await expect(card).toBeVisible();
  return card;
}

test('deactivate: confirmation with an optional reason up to 500, Escape closes only the dialog, success updates card, list and history [STORY-ROLE-05-5]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userActivationPage(page, 'Василь Мороз');
  const version = fixture.detail.version;
  const card = await openCard(page, isMobile, 'Василь Мороз');
  const trigger = card.getByRole('button', { name: activationT.deactivate });
  await expect(
    card.getByRole('group', { name: activationT.actionsLabel }),
  ).toBeVisible();
  await trigger.click();
  const dialog = deactivateDialog(page, 'Василь Мороз');
  await expect(dialog).toBeVisible();
  for (const text of [
    activationT.deactivateBody,
    activationT.sessions,
    activationT.roles,
    activationT.reasonHint,
  ])
    await expect(dialog.getByText(text, { exact: true })).toBeVisible();
  const reason = dialog.getByLabel(activationT.reasonLabel);
  await reason.fill('ж'.repeat(510));
  await expect(reason).toHaveValue('ж'.repeat(500));
  await expect(dialog.getByText('500/500', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(trigger).toBeFocused();
  expect(fixture.posts).toEqual([]);

  await trigger.click();
  await expect(reason).toHaveValue('');
  await reason.fill('Завершив співпрацю');
  await dialog.getByRole('button', { name: activationT.deactivate }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(
      activationT.deactivateToast.replace('{name}', 'Василь Мороз'),
      { exact: true },
    ),
  ).toBeVisible();
  expect(fixture.posts).toEqual([
    {
      action: 'deactivate',
      expectedVersion: version,
      reason: 'Завершив співпрацю',
    },
  ]);
  await expect(
    card.getByRole('heading', {
      name: `Василь Мороз ${t.deactivatedSuffix}`,
    }),
  ).toBeFocused();
  await expect(
    card.getByText(t.status.DEACTIVATED, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText(drawerT.rolesInactive, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: activationT.reactivate }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: drawerT.editRoles }),
  ).toHaveCount(0);
  await card.getByRole('tab', { name: drawerT.tabHistory }).click();
  await expect(
    card
      .getByRole('list', { name: drawerT.historyTitle })
      .getByText(messages.settings.audit.actions.user.deactivated, {
        exact: true,
      }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(listedUser(page, isMobile, 'Василь Мороз')).toContainText(
    t.status.DEACTIVATED,
  );
});

test('deactivate: own card and the last active Admin stay disabled with the reason [D45]', async ({
  page,
  isMobile,
}) => {
  const self = await openCard(page, isMobile, 'Іван Коваленко');
  const own = self.getByRole('button', { name: activationT.deactivate });
  await expect(own).toHaveAttribute('aria-disabled', 'true');
  await expect(own).toHaveAccessibleDescription(activationT.selfReason);
  // aria-disabled keeps the reason reachable; Playwright treats it as disabled, so force the click.
  await own.click({ force: true });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(self).toHaveCount(0);

  await userActivationPage(page, 'Василь Мороз', (detail) => {
    detail.roles = [...detail.roles, { role: 'ADMIN', vertical: null }];
    detail.lastActiveAdmin = true;
  });
  const last = await openCard(page, isMobile, 'Василь Мороз');
  const button = last.getByRole('button', { name: activationT.deactivate });
  await expect(button).toHaveAccessibleDescription(activationT.lastAdminReason);
  await button.click({ force: true });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('deactivate: an unconfirmed provider ban keeps the dialog and reason, refreshes the version and retries [SEC-AUTH-R04, ADR-011]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userActivationPage(page, 'Василь Мороз');
  const version = fixture.detail.version;
  fixture.answerNext(problem(400, 'VALIDATION_FAILED'));
  fixture.answerNext(problem(503, 'DEACTIVATION_INCOMPLETE'));
  const card = await openCard(page, isMobile, 'Василь Мороз');
  await card.getByRole('button', { name: activationT.deactivate }).click();
  const dialog = deactivateDialog(page, 'Василь Мороз');
  const reason = dialog.getByLabel(activationT.reasonLabel);
  await reason.fill('Звільнення');
  const submit = dialog.getByRole('button', { name: activationT.deactivate });
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    activationT.deactivateInvalid,
  );
  await expect(reason).toHaveValue('Звільнення');
  await expect(
    dialog.getByRole('button', { name: messages.settings.common.cancel }),
  ).toBeVisible();

  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    activationT.deactivateIncomplete,
  );
  await expect(dialog).toBeVisible();
  await expect(reason).toHaveValue('Звільнення');
  const retry = dialog.getByRole('button', {
    name: activationT.retryDeactivate,
  });
  await expect(retry).toBeFocused();
  // Local deactivation already committed: leaving is «Закрити», not «Скасувати».
  await expect(
    dialog.getByRole('button', { name: messages.common.close, exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: messages.settings.common.cancel }),
  ).toHaveCount(0);
  await retry.click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.posts.map((post) => post.expectedVersion)).toEqual([
    version,
    version,
    version + 1,
  ]);
  expect(fixture.posts[2]).toMatchObject({ reason: 'Звільнення' });
  await expect(
    page.getByText(
      activationT.deactivateToast.replace('{name}', 'Василь Мороз'),
      { exact: true },
    ),
  ).toBeVisible();
});

test('reactivate: previous roles start checked, all may be unchecked, Escape closes only the dialog, 503 keeps the selection, success restores the chosen roles [D44, STORY-ROLE-05-5]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userActivationPage(page, 'Юлія Петренко', (detail) => {
    detail.roles = [
      ...detail.roles,
      { role: 'HR', vertical: detail.roles[0]!.vertical },
    ];
  });
  const version = fixture.detail.version;
  const gambling = fixture.detail.roles[0]!.vertical!.id;
  const card = await openCard(page, isMobile, 'Юлія Петренко');
  const trigger = card.getByRole('button', { name: activationT.reactivate });
  await trigger.click();
  const dialog = reactivateDialog(page, 'Юлія Петренко');
  await expect(dialog.getByText(activationT.reactivateBody)).toBeVisible();
  const recruiter = dialog.getByLabel(`${roles.RECRUITER} · Гемблінг`, {
    exact: true,
  });
  const hr = dialog.getByLabel(`${roles.HR} · Гемблінг`, { exact: true });
  await expect(recruiter).toBeChecked();
  await expect(hr).toBeChecked();
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await recruiter.uncheck();
  await hr.uncheck();
  await expect(
    dialog.getByText(activationT.noRolesWarning, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(recruiter).toBeChecked();
  await expect(hr).toBeChecked();
  await hr.uncheck();
  fixture.answerNext(problem(503, 'REACTIVATION_INCOMPLETE'));
  const submit = dialog.getByRole('button', {
    name: activationT.reactivateSubmit,
  });
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    activationT.reactivateIncomplete,
  );
  await expect(recruiter).toBeChecked();
  await expect(hr).not.toBeChecked();
  await expect(submit).toBeFocused();

  await submit.click();
  await expect(dialog).toHaveCount(0);
  const restored = [{ role: 'RECRUITER', verticalId: gambling }];
  expect(fixture.posts).toEqual([
    { action: 'reactivate', expectedVersion: version, roles: restored },
    { action: 'reactivate', expectedVersion: version, roles: restored },
  ]);
  await expect(
    page.getByText(
      activationT.reactivateToast.replace('{name}', 'Юлія Петренко'),
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', { name: 'Юлія Петренко' }),
  ).toBeFocused();
  await expect(card.getByText(t.status.ACTIVE, { exact: true })).toBeVisible();
  await expect(
    card.getByText(`${roles.RECRUITER} · Гемблінг`, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText(`${roles.HR} · Гемблінг`, { exact: true }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: activationT.deactivate }),
  ).toBeVisible();
});

test('reactivate: without previous roles explains and sends none; a version conflict closes and refreshes [D44, ADR-006]', async ({
  page,
  isMobile,
}) => {
  const fixture = await userActivationPage(page, 'Юлія Петренко', (detail) => {
    detail.roles = [];
  });
  const card = await openCard(page, isMobile, 'Юлія Петренко');
  const trigger = card.getByRole('button', { name: activationT.reactivate });
  await trigger.click();
  const dialog = reactivateDialog(page, 'Юлія Петренко');
  await expect(
    dialog.getByText(activationT.noPreviousRoles, { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  fixture.answerNext(problem(409, 'STALE_STATE'));
  await dialog
    .getByRole('button', { name: activationT.reactivateSubmit })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(messages.settings.common.conflict, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('heading', {
      name: `Юлія Петренко ${t.deactivatedSuffix}`,
    }),
  ).toBeFocused();

  await trigger.click();
  await dialog
    .getByRole('button', { name: activationT.reactivateSubmit })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    fixture.posts.map((post) => post.action === 'reactivate' && post.roles),
  ).toEqual([[], []]);
  await expect(card.getByText(drawerT.noRoles, { exact: true })).toBeVisible();
});

test('invite dialog: an address of a deactivated user offers «Активувати знову» and opens that card [D42, STORY-ROLE-05-1]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/users');
  const id = await userIdOf(page, isMobile, 'Юлія Петренко');
  await page.route('**/api/v1/invites', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        status: 409,
        code: 'USER_DEACTIVATED',
        type: 'about:blank',
        details: { userId: id },
      },
    }),
  );
  await page.getByRole('button', { name: t.invite }).click();
  const dialog = page.getByRole('dialog', { name: inviteT.title });
  await dialog.getByLabel(inviteT.nameLabel).fill('Юлія Петренко');
  await dialog
    .getByLabel(inviteT.emailLabel)
    .fill('Yulia.Petrenko@Company.com');
  await dialog.getByLabel(`${roles.RECRUITER} · Гемблінг`).check();
  await dialog.getByRole('button', { name: inviteT.submit }).click();
  await expect(
    dialog.getByText(inviteT.errors.userDeactivated, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: inviteT.errors.showInList }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: inviteT.errors.reactivateInstead })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(withUser(id));
  const card = userCardDialog(page);
  await expect(
    card.getByRole('heading', {
      name: `Юлія Петренко ${t.deactivatedSuffix}`,
    }),
  ).toBeFocused();
  await expect(
    card.getByRole('button', { name: activationT.reactivate }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.getByLabel(t.searchLabel, { exact: true })).toBeFocused();
  await expect(page.getByLabel(t.searchLabel, { exact: true })).toHaveValue(
    'yulia.petrenko@company.com',
  );
});

test('captures role changes and removal confirmation with deterministic state [SHOT-01..03]', async ({
  page,
  isMobile,
}, testInfo) => {
  await userRolesPage(page, 'Василь Мороз');
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  mkdirSync('screenshots/phase-1', { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  const capture = async (state: string, theme: string) => {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const file = `12-admin-user-roles-${state}-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({
      path,
      animations: 'disabled',
      scale: 'css',
      fullPage: true,
    });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  };
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    const { dialog } = await openRoles(page, isMobile, 'Василь Мороз');
    await dialog
      .getByLabel(`${roles.TEAM_LEAD} · Гемблінг`, { exact: true })
      .uncheck();
    await dialog
      .getByLabel(`${roles.RECRUITER} · Крипто`, { exact: true })
      .check();
    await expect(dialog.getByText(rolesT.added, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(rolesT.removed, { exact: true }),
    ).toBeVisible();
    await capture('dialog', theme);
    await dialog.getByRole('button', { name: rolesT.submit }).click();
    const confirm = page.getByRole('alertdialog', {
      name: rolesT.confirmTitle,
    });
    await expect(confirm).toBeVisible();
    await capture('remove', theme);
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('captures deactivation, its unconfirmed provider ban and reactivation with deterministic state [SHOT-01..03]', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const capture = async (state: string, theme: string) => {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const file = `13-admin-user-${state}-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({
      path,
      animations: 'disabled',
      scale: 'css',
      fullPage: true,
    });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  };
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.unrouteAll({ behavior: 'wait' });
    const active = await userActivationPage(page, 'Василь Мороз');
    const card = await openCard(page, isMobile, 'Василь Мороз');
    await card.getByRole('button', { name: activationT.deactivate }).click();
    const deactivate = deactivateDialog(page, 'Василь Мороз');
    await deactivate
      .getByLabel(activationT.reasonLabel)
      .fill('Завершив співпрацю з компанією');
    await expect(deactivate.getByText('30/500', { exact: true })).toBeVisible();
    await capture('deactivate-dialog', theme);
    active.answerNext(problem(503, 'DEACTIVATION_INCOMPLETE'));
    await deactivate
      .getByRole('button', { name: activationT.deactivate })
      .click();
    await expect(deactivate.getByRole('alert')).toHaveText(
      activationT.deactivateIncomplete,
    );
    await expect(
      deactivate.getByRole('button', { name: activationT.retryDeactivate }),
    ).toBeFocused();
    await expect(
      page.getByRole('heading', {
        name: `Василь Мороз ${t.deactivatedSuffix}`,
        includeHidden: true,
      }),
    ).toBeVisible();
    await expect(
      isMobile
        ? page
            .getByRole('list', { name: t.caption, includeHidden: true })
            .locator('> li')
        : page.locator('tbody tr'),
    ).toContainText([t.status.DEACTIVATED]);
    await capture('deactivate-failed', theme);
    await page.keyboard.press('Escape');
    await expect(deactivate).toHaveCount(0);

    await userActivationPage(page, 'Юлія Петренко');
    const deactivated = await openCard(page, isMobile, 'Юлія Петренко');
    await expect(
      deactivated.getByRole('heading', {
        name: `Юлія Петренко ${t.deactivatedSuffix}`,
      }),
    ).toBeVisible();
    await expect(
      deactivated.getByText(drawerT.rolesInactive, { exact: true }),
    ).toBeVisible();
    const trigger = deactivated.getByRole('button', {
      name: activationT.reactivate,
    });
    await expect(trigger).toBeVisible();
    await capture('reactivate-card', theme);
    await trigger.click();
    const reactivate = reactivateDialog(page, 'Юлія Петренко');
    await expect(
      reactivate.getByLabel(`${roles.RECRUITER} · Гемблінг`, { exact: true }),
    ).toBeChecked();
    await capture('reactivate-dialog', theme);
    await page.keyboard.press('Escape');
    await expect(reactivate).toHaveCount(0);
  }
});

test('captures invitation actions, revoke confirmation and change email with deterministic state [SHOT-01..03]', async ({
  page,
  isMobile,
}, testInfo) => {
  const fixture = await userInvitePage(page);
  const name = fixture.detail.fullName;
  await page.route(`**/api/v1/users/${fixture.detail.id}/email`, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        status: 409,
        code: 'USER_EXISTS',
        errors: [{ path: 'body.email', code: 'taken' }],
      },
    }),
  );
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const capture = async (state: string, theme: string) => {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const file = `11-admin-user-${state}-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({
      path,
      animations: 'disabled',
      scale: 'css',
      fullPage: true,
    });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  };
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/users?q=Богдан');
    await listedUser(page, isMobile, name).click();
    const card = drawer(page);
    await expect(
      card.getByText('Прострочене з 16.11.2026, 09:00', { exact: true }),
    ).toBeVisible();
    await capture('invite-actions', theme);
    await card
      .getByRole('button', { name: drawerT.revoke, exact: true })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await capture('invite-revoke', theme);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await card.getByRole('button', { name: drawerT.moreActions }).click();
    const item = page.getByRole('menuitem', { name: changeT.menuItem });
    await expect(item).toBeVisible();
    await capture('change-email-menu', theme);
    await item.click();
    const dialog = changeDialog(page, name);
    const input = dialog.getByLabel(changeT.newLabel);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(fixture.detail.email);
    await capture('change-email-dialog', theme);
    await input.fill('olena.taken@company.com');
    await dialog.getByRole('button', { name: changeT.submit }).click();
    await expect(
      dialog.getByText(t.inviteDialog.errors.userExists, { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: t.inviteDialog.errors.showInList }),
    ).toBeVisible();
    await capture('change-email-taken', theme);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeVisible();
  }
});

test('captures the user card screenshots with fixed sign-in times [SHOT-01..03]', async ({
  page,
  isMobile,
}, testInfo) => {
  const anchor = Date.parse(FIXED_CLOCK_ISO);
  const lastLogin = new Date(anchor - 3_600_000).toISOString();
  await page.route('**/api/v1/users?*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      items: { lastLoginAt: string | null }[];
    };
    body.items.forEach((item, index) => {
      if (item.lastLoginAt)
        item.lastLoginAt = new Date(
          anchor - (index + 1) * 3_600_000,
        ).toISOString();
    });
    await route.fulfill({ response, json: body });
  });
  await page.route(
    (url) => /^\/api\/v1\/users\/[0-9a-f-]{36}$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { lastLoginAt: string | null };
      body.lastLoginAt = lastLogin;
      await route.fulfill({ response, json: body });
    },
  );
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const viewport = isMobile ? 'mobile' : 'desktop';
  const capture = async (file: string) => {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({ path, animations: 'disabled', scale: 'css' });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
  };
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/users?status=REVOKED');
    const refetched = page.waitForResponse((response) =>
      response.url().includes('/api/v1/users?'),
    );
    await page.getByLabel(t.filterStatus, { exact: true }).selectOption('');
    await refetched;
    await expect(listed(page, isMobile)).toHaveCount(13);
    await listedUser(page, isMobile, 'Василь Мороз').click();
    const card = drawer(page);
    await expect(card.getByText('Гемблінг: П0', { exact: true })).toBeVisible();
    await expect(
      card.getByText('Останній вхід: 16.11.2026, 09:00', { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText(drawerT.mfaOptionalRole, { exact: true }),
    ).toBeVisible();
    await capture(`10-admin-user-drawer-profile-${viewport}-${theme}.png`);

    await card.getByRole('tab', { name: drawerT.tabHistory }).click();
    const times = card
      .getByRole('list', { name: drawerT.historyTitle })
      .locator('time');
    await expect(times.first()).toBeVisible();
    expect(
      new Set(
        await times.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('datetime')),
        ),
      ),
    ).toEqual(new Set([FIXED_CLOCK_ISO]));
    await expect(card.getByRole('button', { name: t.loadMore })).toHaveCount(0);
    await capture(`10-admin-user-drawer-history-${viewport}-${theme}.png`);
  }
});
