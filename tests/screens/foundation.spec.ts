import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';

test('foundation not-found screen', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Сторінку не знайдено', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const variant = testInfo.project.name.replace('screens-foundation-', '');
  mkdirSync('screenshots/foundation', { recursive: true });
  await page.screenshot({
    path: `screenshots/foundation/01-public-not-found-${variant}.png`,
    animations: 'disabled',
    scale: 'css',
    fullPage: true,
  });
});
