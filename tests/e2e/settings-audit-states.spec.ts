import { expect, test, type Route } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { SHOT_RENAME, SHOT_ROWS } from '../support/audit-shot-fixture';
import { checkAccessibility } from '../support/accessibility';
import { sessionFile } from '../support/e2e-session';
import { captureScreen, forEachTheme, viewportOf } from './screens';

test.use({ storageState: sessionFile('admin@demo') });
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));
const t = messages.settings.audit;

test('audit loading, error, empty and date-validation states are captured [UI-06, SHOT-01..03]', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await forEachTheme(page, async (theme) => {
    await page.goto('/settings/audit?period=365d');
    let mode: 'pending' | 'error' | 'empty' = 'pending';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const matcher = (url: URL) =>
      url.pathname === '/api/v1/audit' &&
      url.searchParams.get('result') === 'DENIED';
    const handler = async (route: Route) => {
      if (mode === 'pending') await pending;
      await route.fulfill(
        mode === 'empty'
          ? { json: { items: [], nextCursor: null, prevCursor: null } }
          : { status: 503, json: { code: 'INTERNAL_ERROR' } },
      );
    };
    await page.route(matcher, handler);
    const capture = (state: string) =>
      captureScreen(
        page,
        testInfo,
        `25-admin-audit-${state}-${viewportOf(testInfo)}-${theme}.png`,
      );
    try {
      await page
        .getByLabel(t.filters.result, { exact: true })
        .selectOption('DENIED');
      await expect(
        page.locator('[data-slot="skeleton"]').first(),
      ).toBeVisible();
      await capture('loading');
      mode = 'error';
      release();
      await expect(
        page.getByText(messages.states.errorTitle, { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await checkAccessibility(page, testInfo);
      await capture('error');
      mode = 'empty';
      await page
        .getByRole('button', { name: messages.common.retry, exact: true })
        .click();
      await expect(
        page.getByText(t.empty.title, { exact: true }),
      ).toBeVisible();
      await capture('empty');
      await page
        .getByLabel(t.filters.period, { exact: true })
        .selectOption('custom');
      await page.getByLabel(t.filters.from, { exact: true }).fill('2025-01-01');
      await page.getByLabel(t.filters.to, { exact: true }).fill('2026-11-01');
      await page
        .getByRole('button', { name: t.filters.apply, exact: true })
        .click();
      await expect(
        page.getByRole('alert').filter({ hasText: t.filters.invalidPeriod }),
      ).toBeVisible();
      await capture('period-invalid');
    } finally {
      release();
      await page.unroute(matcher, handler);
    }
  });
});

test('audit JSON and missing record stay inside the accessible detail sheet [UI-06, SHOT-01..03]', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(
    (url) => url.pathname === '/api/v1/audit',
    (route) =>
      route.fulfill({
        json: { items: SHOT_ROWS, nextCursor: null, prevCursor: null },
      }),
  );
  await page.route(
    (url) => /^\/api\/v1\/audit\/\d+$/.test(url.pathname),
    (route) =>
      route.fulfill(
        route.request().url().endsWith(`/${SHOT_RENAME.id}`)
          ? { json: SHOT_RENAME }
          : { status: 404, json: { code: 'NOT_FOUND' } },
      ),
  );
  await forEachTheme(page, async (theme) => {
    const capture = (state: string) =>
      captureScreen(
        page,
        testInfo,
        `25-admin-audit-${state}-${viewportOf(testInfo)}-${theme}.png`,
      );
    await page.goto(`/settings/audit?record=${SHOT_RENAME.id}`);
    const rows = page.locator('[data-audit-row]:visible');
    await expect(rows).toHaveCount(SHOT_ROWS.length);
    await expect(rows.first()).toHaveAttribute(
      'data-audit-row',
      SHOT_ROWS[0]!.id,
    );
    const sheet = page.getByRole('dialog');
    await sheet
      .getByRole('button', { name: t.detail.showJson, exact: true })
      .click();
    await expect(sheet.locator('pre')).toBeVisible();
    await checkAccessibility(page, testInfo);
    await capture('json');
    await page.goto('/settings/audit?record=9223372036854775807');
    await expect(rows).toHaveCount(SHOT_ROWS.length);
    await expect(rows.first()).toHaveAttribute(
      'data-audit-row',
      SHOT_ROWS[0]!.id,
    );
    await expect(
      sheet.getByText(t.detail.notFound, { exact: true }),
    ).toBeVisible();
    await capture('not-found');
    await sheet
      .getByRole('button', { name: t.detail.close, exact: true })
      .click();
    await expect(sheet).toHaveCount(0);
  });
});
