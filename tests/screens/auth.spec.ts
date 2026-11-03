import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { settleRendering } from '../e2e/screens';

const screens = [
  { id: '01-public-login', path: '/login', heading: 'Вхід до Hiring' },
  {
    id: '02-public-confirm',
    path: `/auth/confirm#token_hash=${'a'.repeat(56)}`,
    heading: 'Підтвердіть вхід',
  },
  {
    id: '03-public-confirm-invalid',
    path: '/auth/confirm',
    heading: 'Підтвердіть вхід',
  },
  {
    id: '04-public-invite-invalid',
    path: '/invite',
    heading: 'Запрошення недійсне',
  },
  {
    id: '05-public-session-expired',
    path: '/session-expired',
    heading: 'Сесію завершено',
  },
] as const;

for (const screen of screens) {
  test(screen.id, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.goto(screen.path);
    await expect(
      page.getByRole('heading', { name: screen.heading, exact: true }),
    ).toBeVisible();
    if (screen.id === '02-public-confirm')
      await expect(
        page.getByRole('button', { name: 'Увійти', exact: true }),
      ).toBeVisible();
    if (screen.id === '03-public-confirm-invalid')
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await settleRendering(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const variant = testInfo.project.name.replace('screens-foundation-', '');
    mkdirSync('screenshots/phase-1', { recursive: true });
    await page.screenshot({
      path: `screenshots/phase-1/${screen.id}-${variant}.png`,
      animations: 'disabled',
      scale: 'css',
      fullPage: true,
    });
  });
}
