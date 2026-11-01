import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';

const t = messages.settings.users;
const roles = messages.common.roles;

/** Read-only screen; runs in `e2e-admin-desktop` and `e2e-admin-mobile` after the vertical-mutating specs. */
test.use({ storageState: sessionFile('admin@demo') });

const rows = (page: Page) =>
  page.getByRole('row').filter({ has: page.getByRole('rowheader') });
const cards = (page: Page) =>
  page.getByRole('list', { name: t.caption }).locator('> li');
const listed = (page: Page, isMobile: boolean) =>
  isMobile ? cards(page) : rows(page);

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

test('Head Recruiter and Finance get not-found for the users screen and API [VIS-01..03, STORY-ROLE-05-4]', async ({
  browser,
}) => {
  for (const email of [
    'head.recruiter.gambling@demo',
    'finance@demo',
  ] as const) {
    const context = await browser.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile(email),
    });
    try {
      expect((await context.request.get('/api/v1/users')).status()).toBe(404);
      const page = await context.newPage();
      await page.goto('/settings/users');
      await expect(
        page.getByRole('heading', { name: messages.errors.notFoundTitle }),
      ).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
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
  await dialog.getByLabel(`${roles.ADMIN} · ${inviteT.allVerticals}`).check();
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
