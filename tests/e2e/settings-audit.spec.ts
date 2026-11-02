import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { AuditPage, AuditRecord } from '../../lib/schemas/audit';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
} from '../support/e2e-session';

const t = messages.settings.audit;

test.use({ storageState: sessionFile('admin@demo') });

test('Admin investigates a real rename, before/after and entity history [STORY-AUD-2]', async ({
  page,
}) => {
  const response = await page.request.get('/api/v1/settings/verticals');
  expect(response.status()).toBe(200);
  const { items } = (await response.json()) as {
    items: { id: string; name: string; version: number }[];
  };
  const original = items.find((item) => item.name === 'Крипто')!;
  expect(original).toBeDefined();
  const name = 'Крипто — перевірка журналу';
  try {
    const renamed = await page.request.patch(
      `/api/v1/verticals/${original.id}`,
      {
        headers: MUTATION_HEADERS,
        data: { name, expectedVersion: original.version },
      },
    );
    expect(renamed.status()).toBe(200);
    await page.goto(
      `/settings/audit?entityType=vertical&entityId=${original.id}&action=vertical.renamed`,
    );
    await expect(
      page.getByRole('heading', { level: 1, name: t.title }),
    ).toBeVisible();
    await expect(
      page.getByLabel(t.filters.action, { exact: true }),
    ).toHaveValue('vertical.renamed');
    const api = await page.request.get(
      `/api/v1/audit?entityType=vertical&entityId=${original.id}&action=vertical.renamed&limit=1`,
    );
    expect(api.status()).toBe(200);
    const record = ((await api.json()) as AuditPage).items[0]!;
    await page
      .getByRole('button', { name: /^Відкрити запис:/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`record=${record.id}`));
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('cell', { name: original.name, exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('cell', { name, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: t.detail.showJson }).click();
    await expect(dialog.locator('pre')).toContainText(`"name": "${name}"`);
    await dialog
      .getByRole('button', { name: new RegExp(t.detail.entityHistory) })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`entityId=${original.id}`));
    await expect(page).not.toHaveURL(/record=/);
    await page.reload();
    await expect(
      page.getByLabel(t.filters.action, { exact: true }),
    ).toHaveValue('');
    const auditLink = page
      .getByRole('navigation', { name: messages.settings.nav.label })
      .getByRole('link', { name: messages.settings.nav.audit });
    // A click that lands while the reloaded page is still hydrating can be dropped; retry until it navigates.
    await expect(async () => {
      await auditLink.click();
      await expect(page).toHaveURL(/\/settings\/audit$/, { timeout: 1_000 });
    }).toPass();
    await expect(
      page.getByLabel(t.filters.entityType, { exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByLabel(t.filters.period, { exact: true }),
    ).toHaveValue('7d');
  } finally {
    const latest = await page.request.get('/api/v1/settings/verticals');
    const { items: current } = (await latest.json()) as { items: typeof items };
    const changed = current.find((item) => item.id === original.id)!;
    if (changed.name !== original.name) {
      const restored = await page.request.patch(
        `/api/v1/verticals/${changed.id}`,
        {
          headers: MUTATION_HEADERS,
          data: { name: original.name, expectedVersion: changed.version },
        },
      );
      expect(restored.status()).toBe(200);
    }
  }
});

test('filters persist in the URL, empty results reset, and unknown record is contained in its sheet [UI-06]', async ({
  page,
}) => {
  await page.goto('/settings/audit?action=vertical.created&result=DENIED');
  await expect(page.getByText(t.empty.title, { exact: true })).toBeVisible();
  await expect(page.getByLabel(t.filters.result, { exact: true })).toHaveValue(
    'DENIED',
  );
  await page.getByRole('button', { name: t.filters.reset }).first().click();
  await expect(page).toHaveURL(/\/settings\/audit$/);
  await expect(
    page.getByRole('button', { name: /^Відкрити запис:/ }).first(),
  ).toBeVisible();
  await page.goto('/settings/audit?record=9223372036854775807');
  await expect(
    page.getByRole('dialog').getByText(t.detail.notFound, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: t.detail.close }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/record=/);
});

test('actor and custom Kyiv dates reach the API, while a period over one year stays on the form [STORY-AUD-2]', async ({
  page,
}) => {
  await page.goto('/settings/audit');
  const actor = page.getByLabel(t.columns.actor, { exact: true });
  const actorId = await actor.locator('option').nth(1).getAttribute('value');
  expect(actorId).toBeTruthy();
  const actorResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/audit?') &&
      new URL(response.url()).searchParams.get('actorId') === actorId,
  );
  await actor.selectOption(actorId!);
  const selected = await actorResponse;
  expect(selected.status()).toBe(200);
  const data = (await selected.json()) as AuditPage;
  expect(data.items.length).toBeGreaterThan(0);
  expect(data.items.every((item) => item.actor?.id === actorId)).toBe(true);

  await page
    .getByLabel(t.filters.period, { exact: true })
    .selectOption('custom');
  await page.getByLabel(t.filters.from, { exact: true }).fill('2025-01-01');
  await page.getByLabel(t.filters.to, { exact: true }).fill('2026-11-01');
  await page
    .getByRole('button', { name: t.filters.apply, exact: true })
    .click();
  const periodError = page
    .getByRole('alert')
    .filter({ hasText: t.filters.invalidPeriod });
  await expect(periodError).toBeVisible();
  await page.getByLabel(t.filters.period, { exact: true }).selectOption('7d');
  await page
    .getByLabel(t.filters.period, { exact: true })
    .selectOption('custom');
  await expect(page).not.toHaveURL(/from=2025-01-01/);
  await page.getByLabel(t.filters.from, { exact: true }).fill('2026-10-30');
  await page.getByLabel(t.filters.to, { exact: true }).fill('2026-10-30');
  const customResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/audit' &&
      url.searchParams.get('from') === '2026-10-30' &&
      url.searchParams.get('to') === '2026-10-30'
    );
  });
  await page
    .getByRole('button', { name: t.filters.apply, exact: true })
    .click();
  expect((await customResponse).status()).toBe(200);
  await expect(periodError).toHaveCount(0);
  await expect(page).toHaveURL(/period=custom/);
  await page.reload();
  await expect(page.getByLabel(t.filters.from, { exact: true })).toHaveValue(
    '2026-10-30',
  );
  await expect(page.getByLabel(t.filters.to, { exact: true })).toHaveValue(
    '2026-10-30',
  );
});

test('Finance and Head Recruiter cannot read audit records or settings [VIS-01..03, D25]', async ({
  browser,
}) => {
  for (const email of [
    'finance@demo',
    'head.recruiter.gambling@demo',
  ] as const) {
    const context = await browser.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile(email),
    });
    try {
      expect((await context.request.get('/api/v1/audit')).status()).toBe(404);
      expect((await context.request.get('/api/v1/audit/1')).status()).toBe(404);
      const page = await context.newPage();
      await page.goto('/settings/audit?record=1');
      await expect(
        page.getByRole('heading', { name: messages.errors.notFoundTitle }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: t.title, exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});

test('audit list and detail render without overflow in both themes [SHOT-01..03, UI-05]', async ({
  page,
  isMobile,
}, testInfo) => {
  const fixture: AuditRecord = {
    id: '4242',
    occurredAt: FIXED_CLOCK_ISO,
    actor: {
      id: '00000000-0000-4000-8000-000000000001',
      fullName: 'Анна Дорошенко',
      isActive: true,
    },
    actorKind: 'USER',
    action: 'vertical.renamed',
    result: 'SUCCESS',
    entity: {
      type: 'vertical',
      id: '00000000-0000-4000-8000-000000000002',
      label: 'Крипто',
    },
    ip: '127.0.0.1',
    before: { name: 'Криптовалюти' },
    after: { name: 'Крипто' },
    details: null,
    userAgent: 'Playwright — Chromium',
    requestId: '00000000-0000-4000-8000-000000000003',
    detailLabels: {},
  };
  await page.route('**/api/v1/audit?*', (route) =>
    route.fulfill({ json: { items: [fixture], nextCursor: null } }),
  );
  await page.route('**/api/v1/audit/4242', (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  mkdirSync('screenshots/phase-1', { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/audit');
    const fixtureResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/audit?') &&
        new URL(response.url()).searchParams.get('action') ===
          'vertical.renamed',
    );
    await page
      .getByLabel(t.filters.action, { exact: true })
      .selectOption('vertical.renamed');
    await fixtureResponse;
    await expect(
      page.getByRole('button', { name: /^Відкрити запис:/ }).first(),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const capture = async (state: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const file = `06-admin-audit-${state}-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
      const path = `screenshots/phase-1/${file}`;
      await page.screenshot({
        path,
        fullPage: true,
        animations: 'disabled',
        scale: 'css',
      });
      copyFileSync(path, `screenshots/latest/${file}`);
      await testInfo.attach(file, { path, contentType: 'image/png' });
    };
    await capture('list');
    await page
      .getByRole('button', { name: /^Відкрити запис:/ })
      .first()
      .click();
    await expect(
      page
        .getByRole('dialog')
        .getByRole('cell', { name: 'Криптовалюти', exact: true }),
    ).toBeVisible();
    await capture('detail');
    await page.getByRole('button', { name: t.detail.close }).click();
  }
});
