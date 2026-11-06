import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { forEachTheme } from './screens';

test('public sign-in, invalid links and expiry meet WCAG 2.1 AA in both themes [UI-05]', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await forEachTheme(page, async () => {
    for (const path of [
      '/login',
      '/invite',
      '/auth/confirm',
      '/session-expired',
      '/missing-page',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await checkAccessibility(page, testInfo);
    }
    await page.goto('/login');
    await page
      .getByRole('button', { name: messages.auth.login.submit, exact: true })
      .click();
    await expect(
      page.getByText(messages.auth.login.emailRequired, { exact: true }),
    ).toBeVisible();
    await checkAccessibility(page, testInfo);
  });
});
