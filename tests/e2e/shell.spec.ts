import { test as base, expect, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { MUTATION_HEADERS, signIn } from '../support/e2e-session';

const t = {
  shell: messages.shell,
  theme: messages.theme,
  profile: messages.profile,
  nav: messages.nav,
};

const demoEmail = (project: string) =>
  project === 'e2e-mobile'
    ? 'recruiter2.gambling@demo'
    : 'recruiter1.gambling@demo';

/** One real session per worker; desktop and mobile use different seeded users so edits never collide. */
const test = base.extend<object, { sessionState: string }>({
  sessionState: [
    async ({ browser }, provide, workerInfo) => {
      const context = await browser.newContext({
        baseURL: 'http://localhost:3100',
      });
      await signIn(context.request, demoEmail(workerInfo.project.name));
      const path = `${workerInfo.project.outputDir}/session-${workerInfo.workerIndex}.json`;
      await context.storageState({ path });
      await context.close();
      await provide(path);
    },
    { scope: 'worker' },
  ],
  storageState: ({ sessionState }, provide) => provide(sessionState),
});

const htmlClass = (page: Page) =>
  page.locator('html').evaluate((element) => element.className);
const themeCookie = async (page: Page) =>
  (await page.context().cookies()).find((cookie) => cookie.name === 'theme')
    ?.value;
const serverHtmlTag = async (page: Page) => {
  const response = await page.request.get('/profile');
  expect(response.status()).toBe(200);
  return (await response.text()).match(/<html[^>]*>/)?.[0];
};

test('theme switch applies at once, persists in a cookie and is server-rendered without a flash [UI-02, A-34]', async ({
  page,
}) => {
  await page.goto('/profile');
  await expect(
    page.getByRole('heading', { name: t.profile.title, exact: true }),
  ).toBeVisible();
  expect(await htmlClass(page)).toBe('');

  await page
    .getByRole('button', {
      name: t.theme.current.replace('{theme}', t.theme.system),
    })
    .click();
  await page
    .getByRole('menuitemradio', { name: t.theme.dark, exact: true })
    .click();
  await expect(page.locator('html')).toHaveClass('dark');
  expect(await themeCookie(page)).toBe('dark');
  await expect(
    page.getByRole('radio', { name: t.theme.dark, exact: true }),
  ).toBeChecked();
  expect(await serverHtmlTag(page)).toBe('<html lang="uk" class="dark">');

  const reloaded = await page.reload();
  expect((await reloaded!.text()).match(/<html[^>]*>/)?.[0]).toBe(
    '<html lang="uk" class="dark">',
  );
  await expect(
    page.getByRole('button', {
      name: t.theme.current.replace('{theme}', t.theme.dark),
    }),
  ).toBeVisible();

  await page.getByText(t.theme.light, { exact: true }).click();
  await expect(page.locator('html')).toHaveClass('light');
  expect(await themeCookie(page)).toBe('light');
  expect(await serverHtmlTag(page)).toBe('<html lang="uk" class="light">');

  await page.getByText(t.theme.system, { exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/light|dark/);
  expect(await themeCookie(page)).toBe('system');
  expect(await serverHtmlTag(page)).toBe('<html lang="uk">');
});

test('name edit validates, updates the user menu at once and persists [ROLE-05-6, UI-07]', async ({
  page,
}) => {
  const me = await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  const original: string = (await me.json()).user.fullName;
  const edited = `${original} Тест`;
  const patches: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/api/v1/me'))
      patches.push(request.postData() ?? '');
  });
  try {
    await page.goto('/profile');
    const input = page.getByLabel(t.profile.nameLabel);
    const save = page.getByRole('button', {
      name: t.profile.save,
      exact: true,
    });
    await expect(input).toHaveValue(original);
    await expect(save).toBeDisabled();

    await input.fill('   ');
    await save.click();
    await expect(
      page.getByText(t.profile.nameRequired, { exact: true }),
    ).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill('я'.repeat(121));
    await save.click();
    await expect(
      page.getByText(t.profile.nameTooLong.replace('{max}', '120'), {
        exact: true,
      }),
    ).toBeVisible();
    expect(patches).toEqual([]);

    await input.fill(`  ${original}    Тест  `);
    await expect(
      page.getByText(t.profile.nameTooLong.replace('{max}', '120')),
    ).toHaveCount(0);
    await save.click();
    await expect(
      page.getByText(t.profile.saved, { exact: true }),
    ).toBeVisible();
    expect(patches.map((body) => JSON.parse(body))).toEqual([
      { fullName: edited },
    ]);
    await expect(page.getByLabel(t.profile.nameLabel)).toHaveValue(edited);

    const menu = page.getByRole('button', { name: t.shell.userMenu });
    await menu.click();
    await expect(
      page.getByRole('menu').getByText(edited, { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByLabel(t.profile.nameLabel)).toHaveValue(edited);
    await page.getByRole('button', { name: t.shell.userMenu }).click();
    await expect(
      page.getByRole('menu').getByText(edited, { exact: true }),
    ).toBeVisible();
  } finally {
    const restored = await page.request.patch('/api/v1/me', {
      headers: MUTATION_HEADERS,
      data: { fullName: original },
    });
    expect(restored.status()).toBe(200);
  }
});

test('a failed name save rolls the shell and the form back [UI-07]', async ({
  page,
}) => {
  await page.route('**/api/v1/me', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          json: { status: 500, code: 'INTERNAL' },
        })
      : route.fallback(),
  );
  await page.goto('/profile');
  const input = page.getByLabel(t.profile.nameLabel);
  const original = await input.inputValue();
  await input.fill(`${original} Тест`);
  await page.getByRole('button', { name: t.profile.save, exact: true }).click();
  await expect(
    page.getByText(t.profile.saveFailed, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(t.profile.nameLabel)).toHaveValue(original);
  await page.getByRole('button', { name: t.shell.userMenu }).click();
  await expect(
    page.getByRole('menu').getByText(original, { exact: true }),
  ).toBeVisible();
});

test('«Завершити інші сесії» ends every other session and keeps the current one [SEC-AUTH-4]', async ({
  page,
  browser,
}, testInfo) => {
  const other = await browser.newContext({ baseURL: 'http://localhost:3100' });
  try {
    await signIn(other.request, demoEmail(testInfo.project.name));
    const otherPage = await other.newPage();
    await otherPage.goto('/profile');
    await expect(otherPage).toHaveURL(/\/profile$/);

    await page.goto('/profile');
    const sessions = page.getByRole('region', {
      name: t.profile.sessionsTitle,
    });
    const rows = sessions.getByRole('listitem');
    await expect(rows.nth(1)).toBeVisible();
    await expect(
      rows.filter({ hasText: t.profile.sessionsCurrent }),
    ).toHaveCount(1);
    await sessions
      .getByRole('button', { name: t.profile.endOthers, exact: true })
      .click();
    await expect(
      page.getByText(/^Завершено \d+ сес(ію|ії|ій)\.$/),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(t.profile.sessionsCurrent);
    await expect(
      page.getByRole('button', { name: t.profile.endOthers, exact: true }),
    ).toHaveCount(0);

    await otherPage.goto('/profile');
    await expect(otherPage).toHaveURL(/\/(session-expired|login)/);
    expect((await other.request.get('/api/v1/me')).status()).toBe(401);

    await page.reload();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(rows).toHaveCount(1);
  } finally {
    await other.close();
  }
});

test('/ lands on the first visible section and the shell exposes skip link and user menu [UI-04-1, UI-06]', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/profile$/);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: t.shell.skipToContent });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await page.getByRole('button', { name: t.shell.userMenu }).click();
  const menu = page.getByRole('menu');
  await expect(
    menu.getByRole('menuitem', { name: t.nav.profile, exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: t.shell.logout, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

async function expectDesktopNav(page: Page) {
  const sidebar = page.getByRole('navigation', { name: t.shell.mainNav });
  await expect(
    sidebar.getByRole('link', { name: t.nav.profile, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: t.shell.collapseSidebar }).click();
  await expect(
    page.getByRole('button', { name: t.shell.expandSidebar }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === 'sidebar')
      ?.value,
  ).toBe('collapsed');
  await page.reload();
  await expect(
    page.getByRole('button', { name: t.shell.expandSidebar }),
  ).toBeVisible();
  await page.getByRole('button', { name: t.shell.expandSidebar }).click();
  await expect(
    page.getByRole('button', { name: t.shell.collapseSidebar }),
  ).toBeVisible();
}

async function expectMobileNav(page: Page) {
  await expect(
    page.getByRole('link', { name: t.shell.homeLink }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: t.shell.mainNav }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: t.shell.more, exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: t.shell.userMenu }).click();
  await page
    .getByRole('menuitem', { name: t.nav.profile, exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
}

test('navigation follows the viewport: sidebar rail on desktop; no bottom nav on mobile while only Profile exists [UI-04, A-46]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/profile');
  await expect(
    page.getByRole('navigation', { name: t.shell.mobileNav, exact: true }),
  ).toHaveCount(0);
  if (isMobile) await expectMobileNav(page);
  else await expectDesktopNav(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
