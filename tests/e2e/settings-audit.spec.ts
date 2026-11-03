import { expect, test, type Page } from '@playwright/test';
import { AUDIT_ACTION_GROUPS } from '../../lib/audit-constants';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type {
  AuditActorPage,
  AuditPage,
  AuditRecord,
} from '../../lib/schemas/audit';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
} from '../support/e2e-session';
import { captureScreen } from './screens';

const t = messages.settings.audit;
const actionLabel = (code: string) => {
  const [group, action] = code.split('.') as [keyof typeof t.actions, string];
  return (t.actions[group] as Record<string, string>)[action]!;
};
const actionTrigger = (page: Page) =>
  page.getByRole('button', { name: new RegExp(`^${t.filters.action} `) });
const actionPicker = (page: Page) =>
  page.getByRole('dialog', { name: t.filters.action, exact: true });
async function selectAction(page: Page, code: string) {
  await actionTrigger(page).click();
  await actionPicker(page)
    .getByRole('checkbox', { name: actionLabel(code), exact: true })
    .check();
  await page.keyboard.press('Escape');
}

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
    await expect(actionTrigger(page)).toHaveAccessibleName(
      `${t.filters.action} ${t.actions.vertical.renamed}`,
    );
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
    await page.goto(
      `/settings/audit?view=security&actions=user.invited,vertical.renamed&record=${record.id}`,
    );
    await expect(dialog.getByRole('cell', { name, exact: true })).toBeVisible();
    await dialog
      .getByRole('button', { name: new RegExp(t.detail.entityHistory) })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`entityId=${original.id}`));
    await expect(page).not.toHaveURL(/record=/);
    await page.reload();
    await expect(actionTrigger(page)).toHaveAccessibleName(
      `${t.filters.action} ${t.filters.all}`,
    );
    await expect(page).not.toHaveURL(/view=|actions?=/);
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

test('grouped actions apply by keyboard, preserve open focus and scroll, and intersect security without clearing the choice [STORY-AUD-2, Q-158, UI-05]', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings/audit?result=DENIED');
  const trigger = actionTrigger(page);
  await trigger.focus();
  await trigger.press('Enter');
  const picker = actionPicker(page);
  const invited = picker.getByRole('checkbox', {
    name: t.actions.user.invited,
    exact: true,
  });
  await expect(invited).toBeFocused();
  await expect(
    picker.getByRole('group', { name: t.actionGroups.users }),
  ).toBeVisible();
  await expect(
    picker.getByRole('group', { name: t.actionGroups.security }),
  ).toHaveCount(1);
  await expect(
    picker.getByRole('group', { name: t.actionGroups.verticals }),
  ).toHaveCount(1);
  await expect(picker.getByRole('checkbox')).toHaveCount(
    Object.values(AUDIT_ACTION_GROUPS).flat().length,
  );
  await expect(picker.getByRole('option')).toHaveCount(0);
  await invited.press('Space');
  await expect(invited).toBeChecked();
  await expect(invited).toBeFocused();
  await expect(page).toHaveURL(/action=user.invited/);
  await page.keyboard.press('Tab');
  await expect(picker.getByRole('checkbox').nth(1)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(invited).toBeFocused();
  const renamed = picker.getByRole('checkbox', {
    name: t.actions.vertical.renamed,
    exact: true,
  });
  await renamed.scrollIntoViewIfNeeded();
  await renamed.focus();
  const scroll = await picker.evaluate((element) => element.scrollTop);
  await renamed.press('Space');
  await expect(renamed).toBeChecked();
  await expect(renamed).toBeFocused();
  expect(await picker.evaluate((element) => element.scrollTop)).toBe(scroll);
  await expect(page).toHaveURL(/actions=user.invited%2Cvertical.renamed/);
  await expect(trigger).toHaveAccessibleDescription(
    `Дії: ${t.actions.user.invited}; ${t.actions.vertical.renamed}`,
  );
  if (isMobile) {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const box = (await picker.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(358);
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(374);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    const row = (await renamed.locator('..').boundingBox())!;
    expect(row.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const security = page.getByRole('button', {
    name: t.views.security,
    exact: true,
  });
  const securityResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/audit' &&
      url.searchParams.get('view') === 'security' &&
      url.searchParams.get('actions') === 'user.invited,vertical.renamed'
    );
  });
  await security.click();
  expect(((await (await securityResponse).json()) as AuditPage).items).toEqual(
    [],
  );
  await expect(page.getByText(t.empty.title, { exact: true })).toBeVisible();
  await expect(security).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(t.filters.result, { exact: true })).toHaveValue(
    'DENIED',
  );
  await trigger.click();
  await expect(invited).toBeFocused();
  await expect(invited).toBeChecked();
  await expect(renamed).toBeChecked();
  await expect(picker.getByRole('checkbox')).toHaveCount(21);
  await invited.press('Space');
  await expect(page).toHaveURL(/action=vertical.renamed/);
  await renamed.focus();
  await renamed.press('Space');
  await expect(trigger).toHaveAccessibleName(
    `${t.filters.action} ${t.filters.all}`,
  );
  await expect(page).not.toHaveURL(/actions?=/);
  await expect(picker).toBeVisible();
  await expect(renamed).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: t.views.all, exact: true }).click();
  await expect(page).not.toHaveURL(/view=/);
  await selectAction(page, 'user.mfa_reset');
  const clear = page.getByRole('button', {
    name: t.filters.actionsClear,
    exact: true,
  });
  if (isMobile) {
    const triggerBox = (await trigger.boundingBox())!;
    const clearBox = (await clear.boundingBox())!;
    const labelBox = (await trigger.locator('span').boundingBox())!;
    expect(triggerBox.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox.height).toBeGreaterThanOrEqual(44);
    expect(clearBox.width).toBeGreaterThanOrEqual(44);
    expect(clearBox.height).toBeGreaterThanOrEqual(44);
    expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(clearBox.x);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(
      triggerBox.x + triggerBox.width,
    );
    expect(
      await trigger.locator('span').evaluate((element) => ({
        overflow: getComputedStyle(element).overflowX,
        whitespace: getComputedStyle(element).whiteSpace,
        textOverflow: getComputedStyle(element).textOverflow,
      })),
    ).toEqual({
      overflow: 'hidden',
      whitespace: 'nowrap',
      textOverflow: 'ellipsis',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await clear.click();
  await expect(trigger).toBeFocused();
  await expect(page).not.toHaveURL(/actions?=/);
  await security.click();
  await page
    .getByRole('button', { name: t.filters.reset, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/settings\/audit$/);
  await expect(
    page.getByRole('button', { name: t.views.all, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('multi-action and security deep links restore across Back, Forward and reload, and malformed repeated page values normalise consistently [STORY-AUD-2]', async ({
  page,
}) => {
  const selected = 'user.invited,auth.login_failed,vertical.renamed';
  await page.goto(
    `/settings/audit?view=security&actions=${selected}&result=DENIED`,
  );
  await expect(
    page.getByRole('button', { name: t.views.security, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(actionTrigger(page)).toHaveAccessibleDescription(
    `Дії: ${t.actions.user.invited}; ${t.actions.auth.login_failed}; ${t.actions.vertical.renamed}`,
  );
  await page.goto('/settings/audit?action=vertical.created');
  await expect(actionTrigger(page)).toHaveAccessibleName(
    `${t.filters.action} ${t.actions.vertical.created}`,
  );
  await page.goBack();
  await expect(page).toHaveURL(/view=security/);
  await expect(actionTrigger(page)).toHaveAccessibleDescription(
    `Дії: ${t.actions.user.invited}; ${t.actions.auth.login_failed}; ${t.actions.vertical.renamed}`,
  );
  await actionTrigger(page).click();
  const picker = actionPicker(page);
  for (const code of selected.split(','))
    await expect(
      picker.getByRole('checkbox', { name: actionLabel(code), exact: true }),
    ).toBeChecked();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(
    page.getByRole('button', { name: t.views.security, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(t.filters.result, { exact: true })).toHaveValue(
    'DENIED',
  );
  await page.goForward();
  await expect(actionTrigger(page)).toHaveAccessibleName(
    `${t.filters.action} ${t.actions.vertical.created}`,
  );
  await expect(
    page.getByRole('button', { name: t.views.all, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.goto(
    '/settings/audit?view=security&view=all&actions=user.invited&actions=vertical.renamed&result=DENIED',
  );
  await expect(actionTrigger(page)).toHaveAccessibleName(
    `${t.filters.action} ${t.filters.all}`,
  );
  await expect(
    page.getByRole('button', { name: t.views.all, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(t.filters.result, { exact: true })).toHaveValue(
    'DENIED',
  );
});

test('changing action or view filters restarts a previously evicted cache window [STORY-AUD-2]', async ({
  page,
}) => {
  const calls: URL[] = [];
  await page.route(
    (url) => url.pathname === '/api/v1/audit',
    async (route) => {
      const url = new URL(route.request().url());
      calls.push(url);
      const index = Number(url.searchParams.get('cursor') ?? '1');
      await route.fulfill({
        json: {
          items: [
            {
              id: String(9000 + index),
              occurredAt: `2026-11-02T10:0${index}:00.000Z`,
              actor: null,
              actorKind: 'SYSTEM',
              action: 'vertical.created',
              result: 'SUCCESS',
              entity: {
                type: 'vertical',
                id: '00000000-0000-4000-8000-000000000001',
                label: `Сторінка ${index}`,
              },
              ip: null,
            },
          ],
          nextCursor: index < 3 ? String(index + 1) : null,
          prevCursor: null,
        },
      });
    },
  );
  await page.goto('/settings/audit');
  await selectAction(page, 'vertical.created');
  const firstPage = page.getByRole('button', {
    name: /^Відкрити запис:.*:01:00/,
  });
  const thirdPage = page.getByRole('button', {
    name: /^Відкрити запис:.*:03:00/,
  });
  await expect(firstPage).toBeVisible();
  await page.getByRole('button', { name: t.loadMore, exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^Відкрити запис:.*:02:00/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: t.loadMore, exact: true }).click();
  await expect(thirdPage).toBeVisible();
  await expect(firstPage).toHaveCount(0);
  await page
    .getByRole('button', { name: t.views.security, exact: true })
    .click();
  await expect(page).not.toHaveURL(/record=/);
  await page.getByRole('button', { name: t.views.all, exact: true }).click();
  await expect(firstPage).toBeVisible();
  await expect(thirdPage).toHaveCount(0);
  const returned = calls.filter(
    (url) =>
      url.searchParams.get('action') === 'vertical.created' &&
      !url.searchParams.has('view'),
  );
  expect(returned.at(-1)!.searchParams.has('cursor')).toBe(false);
  await page.getByRole('button', { name: t.loadMore, exact: true }).click();
  await page.getByRole('button', { name: t.loadMore, exact: true }).click();
  await expect(thirdPage).toBeVisible();
  await selectAction(page, 'user.invited');
  await actionTrigger(page).click();
  await actionPicker(page)
    .getByRole('checkbox', { name: t.actions.user.invited, exact: true })
    .uncheck();
  await page.keyboard.press('Escape');
  await expect(firstPage).toBeVisible();
  await expect(thirdPage).toHaveCount(0);
});

type AuditRow = AuditPage['items'][number];

const deniedRows = (count: number): AuditRow[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(20_000 - index),
    occurredAt: new Date(
      Date.UTC(2026, 10, 2, 9, 0) - index * 60_000,
    ).toISOString(),
    actor: null,
    actorKind: 'SYSTEM',
    action: 'vertical.created',
    result: 'DENIED',
    entity: {
      type: 'vertical',
      id: '00000000-0000-4000-8000-000000000001',
      label: 'Крипто',
    },
    ip: null,
  }));

/** Serves `rows` with the `/audit` keyset contract (items newest first, `prevCursor`/`nextCursor` per side); `gate` may hold a request or answer it with an error status. */
async function routeAuditWindow(
  page: Page,
  rows: readonly AuditRow[],
  {
    pageSize = 50,
    gate,
  }: {
    pageSize?: number;
    gate?: (url: URL) => Promise<number | undefined>;
  } = {},
) {
  const calls: URL[] = [];
  await page.route(
    (url) => url.pathname === '/api/v1/audit',
    async (route) => {
      const url = new URL(route.request().url());
      calls.push(url);
      const status = await gate?.(url);
      if (status) {
        await route.fulfill({
          status,
          json: {
            type: 'about:blank',
            title: 'Error',
            status,
            code: 'INTERNAL',
          },
        });
        return;
      }
      const cursor = url.searchParams.get('cursor');
      const newer = url.searchParams.get('direction') === 'newer';
      const at = cursor ? rows.findIndex((row) => row.id === cursor) : -1;
      const start = newer ? Math.max(0, at - pageSize) : at + 1;
      const items = rows.slice(start, newer ? at : start + pageSize);
      const more = newer ? start > 0 : start + pageSize < rows.length;
      await route.fulfill({
        json: {
          items,
          nextCursor: (newer || more) && items.length ? items.at(-1)!.id : null,
          prevCursor:
            cursor && (!newer || more) && items.length ? items[0]!.id : null,
        } satisfies AuditPage,
      });
    },
  );
  return calls;
}

function auditWindow(page: Page, rows: readonly AuditRow[]) {
  const shownRows = page.locator('[data-audit-row]:visible');
  return {
    shownRows,
    shownIds: () =>
      shownRows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-audit-row')!),
      ),
    idsOf: (from: number, to: number) =>
      rows.slice(from, to).map((row) => row.id),
    loadMore: page.getByRole('button', { name: t.loadMore, exact: true }),
    loadNewer: page.getByRole('button', { name: t.loadNewer, exact: true }),
  };
}

const newerRequests = (calls: readonly URL[]) =>
  calls.filter((url) => url.searchParams.get('direction') === 'newer');

test('«Показати новіші» returns from an evicted window to the newest records with a stable anchor row and focus [STORY-AUD-4]', async ({
  page,
  isMobile,
}) => {
  const rows = deniedRows(180);
  const calls = await routeAuditWindow(page, rows);
  await page.goto('/settings/audit');
  await page
    .getByLabel(t.filters.result, { exact: true })
    .selectOption('DENIED');
  const { shownRows, shownIds, idsOf, loadMore, loadNewer } = auditWindow(
    page,
    rows,
  );
  await expect(shownRows.first()).toHaveAttribute(
    'data-audit-row',
    rows[0]!.id,
  );
  for (const last of [100, 150, 180]) {
    await loadMore.click();
    await expect(shownRows.last()).toHaveAttribute(
      'data-audit-row',
      rows[last - 1]!.id,
    );
    if (last === 100) await expect(loadNewer).toHaveCount(0);
  }
  expect(await shownIds()).toEqual(idsOf(100, 180));
  await expect(loadMore).toHaveCount(0);
  await expect(loadNewer).toBeVisible();
  const newerBox = (await loadNewer.boundingBox())!;
  expect(newerBox.y).toBeLessThan((await shownRows.first().boundingBox())!.y);
  if (isMobile) {
    expect(newerBox.height).toBeGreaterThanOrEqual(44);
    expect(newerBox.width).toBeGreaterThanOrEqual(
      (await shownRows.first().boundingBox())!.width - 2,
    );
  }

  const pressNewer = async (anchorId: string, firstId: string) => {
    const anchor = page.locator(`[data-audit-row="${anchorId}"]:visible`);
    await loadNewer.scrollIntoViewIfNeeded();
    const before = (await anchor.boundingBox())!.y;
    await loadNewer.click();
    await expect(shownRows.first()).toHaveAttribute('data-audit-row', firstId);
    await expect
      .poll(async () => Math.abs((await anchor.boundingBox())!.y - before))
      .toBeLessThanOrEqual(3);
    const ids = await shownIds();
    expect(ids.length).toBeLessThanOrEqual(100);
    expect(new Set(ids).size).toBe(ids.length);
    return anchor;
  };

  await pressNewer(rows[100]!.id, rows[50]!.id);
  expect(await shownIds()).toEqual(idsOf(50, 150));
  await expect(loadNewer).toBeFocused();
  await expect(loadMore).toBeVisible();
  const shown = page.getByText(t.shown.replace('{shown}', '100'), {
    exact: true,
  });
  await expect(shown).toBeVisible();
  await expect(shown.locator('..')).toHaveAttribute('aria-live', 'polite');
  const shownBefore = (await shown.elementHandle())!;

  const anchor = await pressNewer(rows[50]!.id, rows[0]!.id);
  expect(await shownIds()).toEqual(idsOf(0, 100));
  // Same count (100→100): the text node is replaced inside the stable live region, so it is announced again.
  expect(await shownBefore.evaluate((node) => node.isConnected)).toBe(false);
  await expect(shown).toBeVisible();
  await expect(shown.locator('..')).toHaveAttribute('aria-live', 'polite');
  await expect(loadNewer).toHaveCount(0);
  await expect(anchor.locator('[data-row-open]')).toBeFocused();
  const newerCalls = newerRequests(calls);
  expect(newerCalls.map((url) => url.searchParams.get('cursor'))).toEqual([
    rows[100]!.id,
    rows[50]!.id,
  ]);
  expect(
    newerCalls.every((url) => url.searchParams.get('result') === 'DENIED'),
  ).toBe(true);

  await loadMore.click();
  await loadMore.click();
  await expect(loadNewer).toBeVisible();
  const entityType = page.getByLabel(t.filters.entityType, { exact: true });
  for (const value of ['vertical', '']) {
    await entityType.selectOption(value);
    await expect(shownRows.first()).toHaveAttribute(
      'data-audit-row',
      rows[0]!.id,
    );
    await expect(loadNewer).toHaveCount(0);
    expect(await shownIds()).toEqual(idsOf(0, 50));
  }
});

test('«Показати новіші» is busy without double requests, keeps rows on error, keeps the record sheet over a focus refetch, and restarts on reset and reload [STORY-AUD-4]', async ({
  page,
  isMobile,
}) => {
  const rows = deniedRows(180);
  let failNewer = false;
  let hold: Promise<void> | null = null;
  const calls = await routeAuditWindow(page, rows, {
    gate: async (url) => {
      if (url.searchParams.get('direction') !== 'newer') return undefined;
      await hold;
      return failNewer ? 500 : undefined;
    },
  });
  await page.route(/\/api\/v1\/audit\/\d+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const row = rows.find((candidate) => candidate.id === id)!;
    return route.fulfill({
      json: {
        ...row,
        before: null,
        after: null,
        details: null,
        userAgent: null,
        requestId: null,
        detailLabels: {},
      } satisfies AuditRecord,
    });
  });
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.goto('/settings/audit');
  const result = page.getByLabel(t.filters.result, { exact: true });
  await result.selectOption('DENIED');
  const { shownRows, shownIds, idsOf, loadMore, loadNewer } = auditWindow(
    page,
    rows,
  );
  await expect(shownRows.first()).toHaveAttribute(
    'data-audit-row',
    rows[0]!.id,
  );
  await expect(loadNewer).toHaveCount(0);
  if (isMobile) {
    const box = (await loadMore.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(
      (await shownRows.first().boundingBox())!.width - 2,
    );
  }
  const moveDown = async (clicks: number) => {
    for (let click = 0; click < clicks; click += 1) await loadMore.click();
    await expect(shownRows.last()).toHaveAttribute(
      'data-audit-row',
      rows[149]!.id,
    );
    await expect(loadNewer).toBeVisible();
  };
  await moveDown(2);
  const errorAlert = page
    .getByRole('alert')
    .filter({ hasText: messages.states.errorTitle });

  failNewer = true;
  await loadNewer.click();
  await expect(errorAlert).toBeVisible({ timeout: 15_000 });
  expect(await shownIds()).toEqual(idsOf(50, 150));
  await expect(loadNewer).toBeVisible();
  await expect(loadMore).toBeEnabled();
  expect((await errorAlert.boundingBox())!.y).toBeLessThan(
    (await shownRows.first().boundingBox())!.y,
  );
  failNewer = false;
  await errorAlert
    .getByRole('button', { name: messages.common.retry, exact: true })
    .click();
  await expect(shownRows.first()).toHaveAttribute(
    'data-audit-row',
    rows[0]!.id,
  );
  await expect(errorAlert).toHaveCount(0);
  await expect(loadNewer).toHaveCount(0);

  await moveDown(1);
  let release!: () => void;
  hold = new Promise((resolve) => {
    release = resolve;
  });
  const before = newerRequests(calls).length;
  const olderRequests = () =>
    calls.filter(
      (url) =>
        url.searchParams.has('cursor') &&
        url.searchParams.get('direction') !== 'newer',
    ).length;
  const olderBefore = olderRequests();
  await loadNewer.click();
  await expect.poll(() => newerRequests(calls).length).toBe(before + 1);
  await expect(loadNewer).toHaveAttribute('aria-busy', 'true');
  await expect(loadNewer).toHaveAttribute('aria-disabled', 'true');
  await expect(loadMore).toHaveAttribute('aria-disabled', 'true');
  await loadNewer.click({ force: true });
  await loadMore.click({ force: true });
  await loadNewer.press('Enter');
  await expect(loadNewer).toBeFocused();
  release();
  hold = null;
  await expect(shownRows.first()).toHaveAttribute(
    'data-audit-row',
    rows[0]!.id,
  );
  expect(newerRequests(calls)).toHaveLength(before + 1);
  expect(olderRequests()).toBe(olderBefore);
  expect(await shownIds()).toEqual(idsOf(0, 100));

  await moveDown(1);
  const retained = idsOf(50, 150);
  const sheetRow = page.locator(`[data-audit-row="${rows[120]!.id}"]:visible`);
  await sheetRow.locator('[data-row-open]').click();
  await expect(page).toHaveURL(new RegExp(`record=${rows[120]!.id}`));
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(t.actions.vertical.created);
  if (!isMobile) await expect(sheetRow).toHaveClass(/bg-primary-subtle/);
  const beforeFocus = calls.length;
  await page.clock.fastForward('00:31');
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
  await expect.poll(() => calls.length).toBe(beforeFocus + 2);
  const refetched = calls.slice(beforeFocus);
  expect(refetched.every((url) => url.searchParams.has('cursor'))).toBe(true);
  expect(
    refetched.every((url) => url.searchParams.get('result') === 'DENIED'),
  ).toBe(true);
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`record=${rows[120]!.id}`));
  expect(await shownIds()).toEqual(retained);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await shownIds()).toEqual(retained);
  await expect(loadNewer).toBeVisible();

  await page.getByRole('button', { name: t.filters.reset }).first().click();
  await expect(page).toHaveURL(/\/settings\/audit$/);
  await expect(loadNewer).toHaveCount(0);
  await result.selectOption('DENIED');
  await expect(shownRows.first()).toHaveAttribute(
    'data-audit-row',
    rows[0]!.id,
  );
  await expect(loadNewer).toHaveCount(0);
  expect(await shownIds()).toEqual(idsOf(0, 50));

  await moveDown(2);
  const beforeReload = calls.length;
  await page.reload();
  await expect(result).toHaveValue('DENIED');
  await expect(loadNewer).toHaveCount(0);
  await expect(page.locator(`[data-audit-row="${rows[149]!.id}"]`)).toHaveCount(
    0,
  );
  expect(
    calls.slice(beforeReload).some((url) => url.searchParams.has('cursor')),
  ).toBe(false);
});

test('selected actions remain editable during a pending list and after an API failure [UI-06, STORY-AUD-2]', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = false;
  await page.route(
    (url) => url.pathname === '/api/v1/audit',
    async (route) => {
      if (new URL(route.request().url()).searchParams.has('action'))
        await pending;
      if (fail)
        await route.fulfill({
          status: 400,
          json: {
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            code: 'VALIDATION_ERROR',
          },
        });
      else
        await route.fulfill({
          json: { items: [], nextCursor: null, prevCursor: null },
        });
    },
  );
  try {
    await page.goto('/settings/audit');
    await actionTrigger(page).click();
    const picker = actionPicker(page);
    const invited = picker.getByRole('checkbox', {
      name: t.actions.user.invited,
      exact: true,
    });
    const request = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === '/api/v1/audit' &&
        url.searchParams.get('action') === 'user.invited'
      );
    });
    await invited.check();
    await request;
    await expect(invited).toBeChecked();
    await expect(picker).toBeVisible();
    await expect(actionTrigger(page)).toHaveAccessibleDescription(
      `Дії: ${t.actions.user.invited}`,
    );
    fail = true;
    release();
    await expect(
      page.getByRole('alert').filter({ hasText: messages.states.errorTitle }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(invited).toBeChecked();
    await picker
      .getByRole('checkbox', { name: t.actions.vertical.renamed, exact: true })
      .check();
    await expect(actionTrigger(page)).toHaveAccessibleDescription(
      `Дії: ${t.actions.user.invited}; ${t.actions.vertical.renamed}`,
    );
    await page.keyboard.press('Escape');
    await expect(actionTrigger(page)).toBeFocused();
    fail = false;
    await page
      .getByRole('button', { name: t.filters.actionsClear, exact: true })
      .click();
    await expect(actionTrigger(page)).toHaveAccessibleName(
      `${t.filters.action} ${t.filters.all}`,
    );
    await expect(
      page.getByRole('alert').filter({ hasText: messages.states.errorTitle }),
    ).toHaveCount(0);
  } finally {
    release();
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

const auditResponse = (actorId: string) => (response: { url(): string }) => {
  const url = new URL(response.url());
  return (
    url.pathname === '/api/v1/audit' &&
    url.searchParams.get('actorId') === actorId
  );
};

test('«Хто» searches all users, picks by keyboard and mouse, keeps the choice in the URL and clears [STORY-AUD-2, wireframe §3.1]', async ({
  page,
  isMobile,
}) => {
  const lookup = await page.request.get(
    `/api/v1/audit/actors?q=${encodeURIComponent('admin@demo')}`,
  );
  expect(lookup.status()).toBe(200);
  const admin = ((await lookup.json()) as AuditActorPage).items[0]!;
  expect(admin).toMatchObject({ isActive: true });

  await page.goto('/settings/audit');
  const trigger = page.getByRole('button', {
    name: `${t.columns.actor} ${t.filters.all}`,
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const picker = page.getByRole('dialog', { name: t.columns.actor });
  const search = picker.getByRole('combobox', { name: t.filters.actorSearch });
  await expect(search).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const system = picker.getByRole('option', { name: t.system });
  await expect(system).toBeVisible();
  await expect(picker.getByRole('option').nth(1)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (isMobile) {
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }

  const searched = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/audit/actors' &&
      url.searchParams.get('q') === 'admin@demo'
    );
  });
  await search.fill('admin@demo');
  expect((await searched).status()).toBe(200);
  const adminOption = picker.getByRole('option', { name: admin.fullName });
  await expect(adminOption).toBeVisible();
  await expect(system).toHaveCount(0);
  await expect(picker.getByRole('option')).toHaveCount(1);
  await search.press('ArrowDown');
  await search.press('ArrowUp');
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    (await adminOption.getAttribute('id'))!,
  );
  await expect(adminOption).toHaveAttribute('aria-selected', 'true');
  const byAdmin = page.waitForResponse(auditResponse(admin.id));
  await search.press('Enter');
  const selected = await byAdmin;
  expect(selected.status()).toBe(200);
  const data = (await selected.json()) as AuditPage;
  expect(data.items.length).toBeGreaterThan(0);
  expect(data.items.every((item) => item.actor?.id === admin.id)).toBe(true);
  await expect(picker).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`actorId=${admin.id}`));
  const chosen = page.getByRole('button', {
    name: `${t.columns.actor} ${admin.fullName}`,
    exact: true,
  });
  await expect(chosen).toBeFocused();

  await chosen.click();
  const current = picker.getByRole('option', {
    name: new RegExp(`^${admin.fullName}\\s*${t.filters.actorSelected}$`),
  });
  await expect(current).toHaveAttribute('aria-selected', 'true');
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    (await current.getAttribute('id'))!,
  );
  await search.press('ArrowUp');
  await expect(current).toHaveAttribute('aria-selected', 'false');
  await expect(current).toContainText(t.filters.actorSelected);
  await search.fill('немає-такого-користувача');
  await expect(
    picker.getByRole('status').filter({ hasText: t.filters.actorEmpty }),
  ).toBeVisible();
  await search.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(chosen).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`actorId=${admin.id}`));

  const clear = page.getByRole('button', { name: t.filters.actorClear });
  if (isMobile) {
    const box = (await clear.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await clear.click();
  await expect(page).not.toHaveURL(/actorId=/);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(search).toHaveValue('');
  const bySystem = page.waitForResponse(auditResponse('system'));
  await system.click();
  const systemPage = (await (await bySystem).json()) as AuditPage;
  expect(
    systemPage.items.every(
      (item) =>
        item.actorKind === 'SYSTEM' &&
        !(item.action === 'auth.login_failed' && !item.entity),
    ),
  ).toBe(true);
  await expect(page).toHaveURL(/actorId=system/);
  await expect(
    page.getByRole('button', {
      name: `${t.columns.actor} ${t.system}`,
      exact: true,
    }),
  ).toBeVisible();
});

test('a deep-linked «Хто» shows the user name even without matching rows, and «Система» by URL [STORY-AUD-2]', async ({
  page,
}) => {
  const lookup = await page.request.get(
    `/api/v1/audit/actors?q=${encodeURIComponent('taras.tl@demo')}`,
  );
  const taras = ((await lookup.json()) as AuditActorPage).items[0]!;
  expect(taras).toBeDefined();
  expect((await page.request.get('/api/v1/audit/actors?q=a')).status()).toBe(
    400,
  );

  await page.goto(
    `/settings/audit?period=today&action=vertical.created&actorId=${taras.id}`,
  );
  await expect(page.getByText(t.empty.title, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: `${t.columns.actor} ${taras.fullName}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/settings/audit?actorId=system');
  await expect(
    page.getByRole('button', {
      name: `${t.columns.actor} ${t.system}`,
      exact: true,
    }),
  ).toBeVisible();
});

test('custom Kyiv dates reach the API, while a period over one year stays on the form [STORY-AUD-2]', async ({
  page,
}) => {
  await page.goto('/settings/audit');
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
  await page.goto(
    '/settings/audit?period=custom&from=2026-02-30&to=2026-03-01',
  );
  await expect(page.getByLabel(t.filters.period, { exact: true })).toHaveValue(
    '7d',
  );
  await expect(page.getByLabel(t.filters.from, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(t.filters.to, { exact: true })).toHaveCount(0);
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
      expect((await context.request.get('/api/v1/audit/actors')).status()).toBe(
        404,
      );
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
  await page.route('**/api/v1/audit?*', (route) => {
    const security =
      new URL(route.request().url()).searchParams.get('view') === 'security';
    return route.fulfill({
      json: {
        items: [
          security
            ? {
                ...fixture,
                action: 'auth.login_failed',
                result: 'DENIED',
                entity: {
                  type: 'user',
                  id: fixture.actor!.id,
                  label: fixture.actor!.fullName,
                },
              }
            : fixture,
        ],
        nextCursor: null,
        prevCursor: null,
      },
    });
  });
  await page.route('**/api/v1/audit/4242', (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/audit/actors',
    (route) =>
      route.fulfill({
        json: {
          items: [
            fixture.actor,
            {
              id: '00000000-0000-4000-8000-000000000004',
              fullName: 'Ігор Литвин',
              isActive: false,
            },
          ],
          nextCursor: null,
        },
      }),
  );
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
    await selectAction(page, 'vertical.renamed');
    await fixtureResponse;
    await expect(
      page.getByRole('button', { name: /^Відкрити запис:/ }).first(),
    ).toBeVisible();
    const capture = async (state: string) => {
      const file = `06-admin-audit-${state}-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`;
      await captureScreen(page, testInfo, file);
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
    await page
      .getByRole('button', {
        name: `${t.columns.actor} ${t.filters.all}`,
        exact: true,
      })
      .click();
    const picker = page.getByRole('dialog', { name: t.columns.actor });
    await picker
      .getByRole('option', { name: fixture.actor!.fullName, exact: true })
      .click();
    await page
      .getByRole('button', {
        name: `${t.columns.actor} ${fixture.actor!.fullName}`,
        exact: true,
      })
      .click();
    await expect(
      picker.getByRole('option', {
        name: new RegExp(
          `${fixture.actor!.fullName}\\s*${t.filters.actorSelected}`,
        ),
      }),
    ).toBeVisible();
    await capture('actors');
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: t.filters.actorClear, exact: true })
      .click();
    await selectAction(page, 'user.mfa_reset');
    await selectAction(page, 'auth.login_failed');
    const summary = page.locator(
      `[id="${await actionTrigger(page).getAttribute('aria-describedby')}"]`,
    );
    await expect(summary).toHaveText(
      `Дії: ${t.actions.user.mfa_reset}; ${t.actions.auth.login_failed}; ${t.actions.vertical.renamed}`,
    );
    expect(
      await summary.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await capture('multi');
    await actionTrigger(page).click();
    await expect(
      actionPicker(page).getByRole('checkbox', {
        name: t.actions.user.mfa_reset,
        exact: true,
      }),
    ).toBeFocused();
    const pickerGeometry = () =>
      actionPicker(page).evaluate((element) => ({
        x: element.getBoundingClientRect().x,
        right: element.getBoundingClientRect().right,
        bottom: element.getBoundingClientRect().bottom,
        heights: [...element.querySelectorAll('label')].map(
          (label) => label.getBoundingClientRect().height,
        ),
      }));
    // The popover is focused on mount but positioned one frame later; wait for placement before measuring or capturing.
    await expect
      .poll(async () => (await pickerGeometry()).x)
      .toBeGreaterThanOrEqual(16);
    // WCAG 2.4.11: the focused checked row must be inside the popover's scroll viewport, not hidden below it.
    await expect
      .poll(() =>
        actionPicker(page).evaluate((element) => {
          const focused = document.activeElement;
          const row = focused?.closest('label')?.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return (
            !!row &&
            element.contains(focused) &&
            (focused as HTMLInputElement).checked &&
            row.top >= box.top &&
            row.bottom <= box.bottom
          );
        }),
      )
      .toBe(true);
    if (isMobile) {
      expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
      const geometry = await pickerGeometry();
      expect(geometry.right).toBeLessThanOrEqual(374);
      expect(geometry.bottom).toBeLessThanOrEqual(844);
      expect(geometry.heights.every((height) => height >= 44)).toBe(true);
    }
    await capture('actions');
    await page.keyboard.press('Escape');
    const securityResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/audit' &&
        new URL(response.url()).searchParams.get('view') === 'security',
    );
    await page
      .getByRole('button', { name: t.views.security, exact: true })
      .click();
    await securityResponse;
    await expect(
      page
        .getByRole('button', { name: /^Відкрити запис: Невдала спроба входу/ })
        .first(),
    ).toBeVisible();
    await capture('security');
  }
});

test('a moved audit window shows «Показати новіші» above the list in both themes [SHOT-01..03, STORY-AUD-4]', async ({
  page,
  isMobile,
}, testInfo) => {
  const people = {
    anna: {
      id: '00000000-0000-4000-8000-000000000001',
      fullName: 'Анна Дорошенко',
      isActive: true,
    },
    olena: {
      id: '00000000-0000-4000-8000-000000000005',
      fullName: 'Олена Коваль',
      isActive: true,
    },
    ihor: {
      id: '00000000-0000-4000-8000-000000000004',
      fullName: 'Ігор Литвин',
      isActive: false,
    },
  };
  const user = (label: string, index: number) => ({
    type: 'user' as const,
    id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
    label,
  });
  const templates: Omit<AuditRow, 'id' | 'occurredAt'>[] = [
    {
      actor: people.anna,
      actorKind: 'USER',
      action: 'vertical.renamed',
      result: 'SUCCESS',
      entity: {
        type: 'vertical',
        id: '00000000-0000-4000-8000-000000000002',
        label: 'Крипто',
      },
      ip: '127.0.0.1',
    },
    {
      actor: people.olena,
      actorKind: 'USER',
      action: 'user.invited',
      result: 'SUCCESS',
      entity: user('Марія Бондар', 1),
      ip: '127.0.0.1',
    },
    {
      actor: null,
      actorKind: 'SYSTEM',
      action: 'auth.login_failed',
      result: 'DENIED',
      entity: user('Тарас Шевчук', 2),
      ip: '127.0.0.1',
    },
    {
      actor: people.anna,
      actorKind: 'USER',
      action: 'user.roles_changed',
      result: 'SUCCESS',
      entity: user('Василь Мельник', 3),
      ip: '127.0.0.1',
    },
    {
      actor: people.ihor,
      actorKind: 'USER',
      action: 'user.mfa_reset',
      result: 'SUCCESS',
      entity: user('Олена Коваль', 4),
      ip: '127.0.0.1',
    },
  ];
  const rows: AuditRow[] = Array.from({ length: 15 }, (_, index) => ({
    ...templates[index % templates.length]!,
    id: String(30_000 - index),
    occurredAt: new Date(
      Date.parse(FIXED_CLOCK_ISO) - (index + 1) * 37 * 60_000,
    ).toISOString(),
  }));
  await routeAuditWindow(page, rows, { pageSize: 5 });
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { shownRows, shownIds, idsOf, loadMore, loadNewer } = auditWindow(
    page,
    rows,
  );
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await page.goto('/settings/audit');
    await page
      .getByLabel(t.filters.period, { exact: true })
      .selectOption('30d');
    await expect(shownRows.first()).toHaveAttribute(
      'data-audit-row',
      rows[0]!.id,
    );
    await loadMore.click();
    await expect(shownRows.last()).toHaveAttribute(
      'data-audit-row',
      rows[9]!.id,
    );
    await loadMore.click();
    await expect(loadNewer).toBeVisible();
    await expect(loadMore).toHaveCount(0);
    expect(await shownIds()).toEqual(idsOf(5, 15));
    expect((await loadNewer.boundingBox())!.y).toBeLessThan(
      (await shownRows.first().boundingBox())!.y,
    );
    await captureScreen(
      page,
      testInfo,
      `06-admin-audit-newer-${isMobile ? 'mobile' : 'desktop'}-${theme}.png`,
    );
  }
});
