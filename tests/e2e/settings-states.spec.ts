import { expect, test, type Route } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';
import { userActivationPage } from '../support/user-activation-page';
import { checkAccessibility } from '../support/accessibility';
import { shotSignIn } from '../support/shot-timeline';
import { captureScreen, forEachTheme, viewportOf } from './screens';

test.use({ storageState: sessionFile('admin@demo') });
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));
const t = messages.settings.users;

test('users loading, failed search and empty retry are accessible and captured [UI-06, SHOT-01..03]', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const viewport = viewportOf(testInfo);
  await forEachTheme(page, async (theme) => {
    await page.goto('/settings/users');
    let mode: 'pending' | 'error' | 'empty' = 'pending';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = async (route: Route) => {
      if (mode === 'pending') await pending;
      await route.fulfill(
        mode === 'empty'
          ? { json: { items: [], nextCursor: null, total: 0 } }
          : { status: 503, json: { code: 'INTERNAL_ERROR' } },
      );
    };
    const matcher = (url: URL) =>
      url.pathname === '/api/v1/users' &&
      url.searchParams.get('q') === 'Немає такого користувача';
    await page.route(matcher, handler);
    try {
      await page
        .getByLabel(t.searchLabel, { exact: true })
        .fill('Немає такого користувача');
      await expect(
        page.locator('[data-slot="skeleton"]').first(),
      ).toBeVisible();
      await captureScreen(
        page,
        testInfo,
        `23-admin-users-loading-${viewport}-${theme}.png`,
      );
      mode = 'error';
      release();
      await expect(
        page.getByText(messages.states.errorTitle, { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `23-admin-users-error-${viewport}-${theme}.png`,
      );
      mode = 'empty';
      await page
        .getByRole('button', { name: messages.common.retry, exact: true })
        .click();
      await expect(
        page.getByText(t.empty.title, { exact: true }),
      ).toBeVisible();
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `23-admin-users-empty-${viewport}-${theme}.png`,
      );
    } finally {
      release();
      await page.unroute(matcher, handler);
    }
  });
});

test('MFA reset validates reason, contains partial failure, returns focus and never changes a real factor [ROLE-05, UI-06, SHOT-01..03]', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const fixture = await userActivationPage(page, 'Андрій Бондар', (detail) => {
    detail.mfa = { state: 'ENABLED', factors: 1, lockedUntil: null };
    detail.lastLoginAt = '2026-11-16T07:04:00.000Z';
  });
  let posts = 0;
  await page.route(
    `**/api/v1/users/${fixture.detail.id}/mfa-reset`,
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        reason: 'Користувач втратив пристрій 2FA',
      });
      posts += 1;
      await route.fulfill({
        status: 503,
        json: { code: 'MFA_RESET_INCOMPLETE' },
      });
    },
  );
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reset = t.drawer.resetMfa;
  await forEachTheme(page, async (theme) => {
    await page.goto('/settings/users');
    await page
      .getByLabel(t.searchLabel, { exact: true })
      .fill(fixture.detail.email);
    const trigger = page.locator(
      `button[data-user-id="${fixture.detail.id}"]:visible`,
    );
    await expect(trigger).toHaveCount(1);
    await trigger.click();
    const card = page.getByRole('dialog').first();
    await card.getByRole('button', { name: reset.submit, exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: reset.title.replace('{name}', fixture.detail.fullName),
    });
    await expect(dialog).toBeVisible();
    await checkAccessibility(page, testInfo);
    await captureScreen(
      page,
      testInfo,
      `24-admin-reset-mfa-dialog-${viewportOf(testInfo)}-${theme}.png`,
    );
    await dialog
      .getByRole('button', { name: reset.submit, exact: true })
      .click();
    await expect(
      dialog.getByText(reset.reasonInvalid, { exact: true }),
    ).toBeVisible();
    await dialog
      .getByLabel(reset.reason, { exact: true })
      .fill('Користувач втратив пристрій 2FA');
    await dialog
      .getByRole('button', { name: reset.submit, exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveText(reset.incomplete);
    await captureScreen(
      page,
      testInfo,
      `24-admin-reset-mfa-incomplete-${viewportOf(testInfo)}-${theme}.png`,
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      card.getByRole('button', { name: reset.submit, exact: true }),
    ).toBeFocused();
  });
  expect(posts).toBe(2);
});

test('own protected actions and missing user are visible in the gallery [D45, UI-06, SHOT-01..03]', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const fixture = await userActivationPage(page, 'Іван Коваленко', (detail) => {
    detail.lastLoginAt = shotSignIn(detail.email);
  });
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await forEachTheme(page, async (theme) => {
    await page.goto('/settings/users');
    await page
      .getByLabel(t.searchLabel, { exact: true })
      .fill(fixture.detail.email);
    const trigger = page.locator(
      `button[data-user-id="${fixture.detail.id}"]:visible`,
    );
    await expect(trigger).toHaveCount(1);
    await trigger.click();
    const card = page.getByRole('dialog');
    const reset = card.getByRole('button', {
      name: t.drawer.resetMfa.submit,
      exact: true,
    });
    await expect(reset).toHaveAttribute('aria-disabled', 'true');
    await expect(
      card.getByText(t.drawer.resetMfa.selfReason, { exact: true }),
    ).toBeVisible();
    await checkAccessibility(page, testInfo);
    await captureScreen(
      page,
      testInfo,
      `24-admin-user-self-${viewportOf(testInfo)}-${theme}.png`,
    );
    await page.goto(
      '/settings/users?q=Богдан&user=00000000-0000-4000-8000-000000000999',
    );
    await expect(
      card.getByText(t.drawer.notFound, { exact: true }),
    ).toBeVisible();
    await captureScreen(
      page,
      testInfo,
      `24-admin-user-not-found-${viewportOf(testInfo)}-${theme}.png`,
    );
  });
});
