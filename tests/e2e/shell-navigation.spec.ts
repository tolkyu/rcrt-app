import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';

const t = messages.shell;

test.use({ storageState: sessionFile('admin@demo') });

test('keyboard opening moves focus into navigation, Escape restores its trigger, and navigation closes it [UI-04..07]', async ({
  page,
  isMobile,
}, testInfo) => {
  if (!isMobile) await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/settings/verticals');
  const trigger = page.getByRole('button', {
    name: isMobile ? t.more : t.openMenu,
    exact: true,
    includeHidden: true,
  });
  const dialog = page.getByRole('dialog', {
    name: isMobile ? t.moreTitle : t.menuTitle,
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
  mkdirSync('screenshots/phase-1', { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/verticals');
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const file = `07-admin-navigation-open-${isMobile ? 'mobile' : 'tablet'}-${theme}.png`;
    const path = `screenshots/phase-1/${file}`;
    await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
      scale: 'css',
    });
    copyFileSync(path, `screenshots/latest/${file}`);
    await testInfo.attach(file, { path, contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});
