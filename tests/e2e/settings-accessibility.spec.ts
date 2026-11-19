import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { sessionFile } from '../support/e2e-session';
import { forEachTheme } from './screens';

test.use({ storageState: sessionFile('admin@demo') });

test('Phase-1 protected screens and key dialogs meet WCAG 2.1 AA [UI-05]', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await forEachTheme(page, async () => {
    for (const path of [
      '/profile',
      '/settings/users',
      '/settings/verticals',
      '/settings/priorities',
      '/settings/audit',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await checkAccessibility(page, testInfo);
    }
    await page.goto('/settings/users');
    await page
      .getByRole('button', {
        name: messages.settings.users.invite,
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await checkAccessibility(page, testInfo);
    await page.keyboard.press('Escape');
    await page.goto('/settings/verticals');
    await page
      .getByRole('button', {
        name: messages.settings.verticals.create,
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await checkAccessibility(page, testInfo);
  });
});
