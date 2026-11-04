import { expect, test } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile } from '../support/e2e-session';
import { captureScreen, forEachTheme } from './screens';

const t = messages.shell;

test.use({ storageState: sessionFile('admin@demo') });

test('keyboard opening moves focus into navigation, Escape restores its trigger, and navigation closes it [UI-04..07]', async ({
  page,
  isMobile,
}, testInfo) => {
  if (!isMobile) await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/settings/verticals');
  if (isMobile) {
    const nav = page.getByRole('navigation', { name: t.mobileNav });
    await expect(nav.getByRole('link')).toHaveText([
      messages.nav.profile,
      messages.nav.settings,
    ]);
    await expect(nav.getByRole('button', { name: t.more })).toHaveCount(0);
    const profile = nav.getByRole('link', {
      name: messages.nav.profile,
      exact: true,
    });
    await profile.focus();
    await profile.press('Enter');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(profile).toHaveAttribute('aria-current', 'page');
    const settings = nav.getByRole('link', {
      name: messages.nav.settings,
      exact: true,
    });
    expect((await settings.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await settings.click();
    await expect(page).toHaveURL(/\/settings\/users$/);
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await forEachTheme(page, async (theme) => {
      await page.goto('/settings/verticals');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages.settings.verticals.title,
        }),
      ).toBeVisible();
      await captureScreen(
        page,
        testInfo,
        `07-admin-navigation-direct-mobile-${theme}.png`,
      );
    });
    return;
  }
  const trigger = page.getByRole('button', {
    name: t.openMenu,
    exact: true,
    includeHidden: true,
  });
  const dialog = page.getByRole('dialog', {
    name: t.menuTitle,
    exact: true,
  });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await trigger.focus();
  await trigger.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const profile = dialog.getByRole('link', {
    name: messages.nav.profile,
    exact: true,
  });
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await expect(dialog.getByRole('link')).toHaveText([
    messages.nav.profile,
    messages.nav.settings,
  ]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.press('Enter');
  await profile.press('Enter');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(dialog).toHaveCount(0);

  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await forEachTheme(page, async (theme) => {
    await page.goto('/settings/verticals');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: messages.settings.verticals.title,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Створено 30.10.2026').filter({ visible: true }),
    ).toHaveCount(2);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    const file = `07-admin-navigation-open-tablet-${theme}.png`;
    await captureScreen(page, testInfo, file);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
});
