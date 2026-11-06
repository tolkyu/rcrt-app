import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { SHOT_RENAME } from '../support/audit-shot-fixture';
import { sessionFile } from '../support/e2e-session';

test.use({ storageState: sessionFile('admin@demo') });

test('audit detail keeps raw device metadata collapsed and copies the request ID [UX-G-16, RA-02]', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route(
    (url) => /^\/api\/v1\/audit\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ json: SHOT_RENAME }),
  );
  await page.goto(`/settings/audit?record=${SHOT_RENAME.id}`);
  const dialog = page.getByRole('dialog');
  const t = messages.settings.audit.detail;
  await expect(
    dialog.getByText('Chrome 130 · Windows', { exact: true }),
  ).toBeVisible();
  const raw = dialog.locator('details');
  await expect(raw).not.toHaveAttribute('open', '');
  await raw.locator('summary').click();
  await expect(
    raw.getByText(SHOT_RENAME.userAgent!, { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: t.copyRequestId }).click();
  await expect(dialog.getByRole('status')).toHaveText(t.copied);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    SHOT_RENAME.requestId,
  );
  await expect(
    dialog.getByRole('link', { name: t.openEntity }),
  ).toHaveAttribute('href', '/settings/verticals');
});

test('audit detail offers a manual fallback when copying is unavailable [UI-06]', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('clipboard unavailable')),
      },
    });
  });
  await page.route(
    (url) => /^\/api\/v1\/audit\/\d+$/.test(url.pathname),
    (route) => route.fulfill({ json: SHOT_RENAME }),
  );
  await page.goto(`/settings/audit?record=${SHOT_RENAME.id}`);
  const dialog = page.getByRole('dialog');
  const t = messages.settings.audit.detail;
  await dialog.getByRole('button', { name: t.copyRequestId }).click();
  await expect(dialog.getByRole('status')).toHaveText(t.failed);
  await expect(
    dialog.getByText(SHOT_RENAME.requestId!, { exact: true }),
  ).toBeVisible();
});
