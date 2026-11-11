import { devices, expect, test, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  sessionFile,
} from '../support/e2e-session';
import { problemFulfill } from '../support/problem';
import { captureScreen, forEachTheme } from './screens';

const t = messages.settings;
const dialogErrors = t.verticals.dialog.errors;

/** Admin-only screen; runs in `e2e-admin-desktop`, the mobile layout is covered by resizing. */
test.use({ storageState: sessionFile('admin@demo') });

test.describe.configure({ mode: 'default' });
const verticalsTable = (page: Page) => page.getByRole('table');
const openDialog = (page: Page) => page.getByRole('dialog');

test('Admin sees every vertical with user counts linked to the users list [STORY-ROLE-03-1]', async ({
  page,
}) => {
  await page.goto('/settings/verticals');
  await expect(
    page.getByRole('heading', { level: 1, name: t.verticals.title }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: t.nav.label })
      .getByRole('link', { name: t.nav.verticals }),
  ).toHaveAttribute('aria-current', 'page');
  const table = verticalsTable(page);
  await expect(
    table.getByRole('rowheader', { name: 'Гемблінг' }),
  ).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Крипто' })).toBeVisible();
  await expect(
    table
      .getByRole('row', { name: /Гемблінг/ })
      .locator('a[href^="/settings/users"]'),
  ).toHaveAttribute(
    'href',
    /^\/settings\/users\?status=ACTIVE&vertical=[0-9a-f-]{36}$/,
  );
  await expect(page.getByText(t.verticals.permanentNote)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /деактив|видал/i }),
  ).toHaveCount(0);
});

test('create dialog validates on the client and shows the server duplicate error in place', async ({
  page,
}) => {
  await page.goto('/settings/verticals');
  await page.getByRole('button', { name: t.verticals.create }).click();
  const dialog = openDialog(page);
  await expect(
    dialog.getByRole('heading', { name: t.verticals.dialog.createTitle }),
  ).toBeVisible();
  const input = dialog.getByLabel(t.verticals.dialog.nameLabel);
  await expect(input).toBeFocused();
  const submit = dialog.getByRole('button', {
    name: t.verticals.dialog.createSubmit,
  });
  await submit.click();
  await expect(dialog.getByText(dialogErrors.required)).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('Г');
  await submit.click();
  await expect(dialog.getByText(dialogErrors.tooShort)).toBeVisible();
  await input.fill('  гемблінг ');
  await submit.click();
  await expect(dialog.getByText(dialogErrors.duplicate)).toBeVisible();
  await expect(input).toHaveValue('  гемблінг ');
});

test('a created vertical appears in alphabetical order with a toast (create response mocked: verticals are permanent, D34)', async ({
  page,
}) => {
  await page.route('**/api/v1/verticals', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toEqual({ name: 'Дейтинг' });
    await route.fulfill({
      status: 201,
      json: {
        id: '00000000-0000-4000-8000-0000000000d1',
        name: 'Дейтинг',
        usersCount: 0,
        createdAt: '2026-11-01T10:00:00.000Z',
        version: 1,
      },
    });
  });
  await page.goto('/settings/verticals');
  await expect(
    verticalsTable(page).getByRole('rowheader').first(),
  ).toBeVisible();
  const namesBefore = await verticalsTable(page)
    .getByRole('rowheader')
    .allTextContents();
  await page.getByRole('button', { name: t.verticals.create }).click();
  await openDialog(page)
    .getByLabel(t.verticals.dialog.nameLabel)
    .fill(' Дейтинг ');
  await openDialog(page)
    .getByRole('button', { name: t.verticals.dialog.createSubmit })
    .click();
  await expect(openDialog(page)).toHaveCount(0);
  await expect(
    page.getByText(t.verticals.toastCreated.replace('{name}', 'Дейтинг')),
  ).toBeVisible();
  await expect(verticalsTable(page).getByRole('rowheader')).toHaveText(
    [...namesBefore, 'Дейтинг'].sort((left, right) =>
      left.localeCompare(right, 'uk'),
    ),
  );
});

test('rename updates the row at once, persists after reload, and blocks an unchanged name', async ({
  page,
}) => {
  await page.goto('/settings/verticals');
  try {
    await page
      .getByRole('button', { name: `${t.verticals.rename}: Крипто` })
      .click();
    const dialog = openDialog(page);
    await expect(
      dialog.getByText(
        t.verticals.dialog.currentName.replace('{name}', 'Крипто'),
      ),
    ).toBeVisible();
    const submit = dialog.getByRole('button', {
      name: t.verticals.dialog.renameSubmit,
    });
    await expect(submit).toBeDisabled();
    await expect(dialog.getByText(dialogErrors.unchanged)).toBeVisible();
    await dialog.getByLabel(t.verticals.dialog.nameLabel).fill('Крипто E2E');
    await submit.click();
    await expect(openDialog(page)).toHaveCount(0);
    await expect(
      page.getByText(
        t.verticals.toastRenamed
          .replace('{from}', 'Крипто')
          .replace('{to}', 'Крипто E2E'),
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      verticalsTable(page).getByRole('rowheader', { name: 'Крипто E2E' }),
    ).toBeVisible();
  } finally {
    const list = await page.request.get('/api/v1/settings/verticals');
    const { items } = (await list.json()) as {
      items: { id: string; name: string; version: number }[];
    };
    const renamed = items.find((item) => item.name === 'Крипто E2E');
    if (renamed)
      await page.request.patch(`/api/v1/verticals/${renamed.id}`, {
        headers: MUTATION_HEADERS,
        data: { name: 'Крипто', expectedVersion: renamed.version },
      });
  }
});

test('mobile: card list without horizontal scroll and the dialog as a bottom sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings/verticals');
  await expect(verticalsTable(page)).toBeHidden();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Гемблінг' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: t.verticals.create }).click();
  const dialog = openDialog(page);
  // The bottom sheet slides in (UI-F8); its resting place is the bottom edge of the screen.
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      return box && Math.round(box.y + box.height);
    })
    .toBe(844);
  const cancel = dialog.getByRole('button', {
    name: t.common.cancel,
    exact: true,
  });
  const submit = dialog.getByRole('button', {
    name: t.verticals.dialog.createSubmit,
    exact: true,
  });
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await expect(submit).toBeInViewport({ ratio: 1 });
  const cancelBox = (await cancel.boundingBox())!;
  const submitBox = (await submit.boundingBox())!;
  expect(cancelBox.height).toBeGreaterThanOrEqual(48);
  expect(submitBox.height).toBeGreaterThanOrEqual(48);
  expect(cancelBox.y + cancelBox.height).toBeLessThanOrEqual(submitBox.y);
});

test('roles without settings permissions get the not-found page and 404 from the API [VIS-02, STORY-ROLE-03-1]', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: E2E_ORIGIN,
    storageState: sessionFile('head.hr@demo'),
  });
  try {
    const page = await context.newPage();
    await page.goto('/settings/verticals');
    await expect(
      page.getByRole('heading', { name: messages.errors.notFoundTitle }),
    ).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: t.nav.label }),
    ).toHaveCount(0);
    expect(
      (await context.request.get('/api/v1/settings/verticals')).status(),
    ).toBe(404);
    expect(
      (
        await context.request.post('/api/v1/verticals', {
          headers: MUTATION_HEADERS,
          data: { name: 'Нутра' },
        })
      ).status(),
    ).toBe(404);
    await page.goto('/');
    await expect(page).toHaveURL(/\/vacancies$/);
  } finally {
    await context.close();
  }
});

test('captures the verticals screenshots; saves are refused in the browser, verticals are permanent (D34) [SHOT-01..03, STORY-ROLE-03-1]', async ({
  browser,
}, testInfo) => {
  const viewports = {
    desktop: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
    },
    mobile: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
  };
  const dialogT = t.verticals.dialog;
  const [taken, stale] = await Promise.all([
    problemFulfill(409, 'VERTICAL_NAME_TAKEN'),
    problemFulfill(409, 'STALE_STATE'),
  ]);
  const saves = { create: 0, rename: 0 };
  for (const [viewport, device] of Object.entries(viewports)) {
    const context = await browser.newContext({
      ...device,
      baseURL: E2E_ORIGIN,
      storageState: sessionFile('admin@demo'),
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
      await page.route('**/api/v1/verticals', (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        saves.create += 1;
        return route.fulfill(taken);
      });
      await page.route('**/api/v1/verticals/*', (route) => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        saves.rename += 1;
        return route.fulfill(stale);
      });
      const items =
        viewport === 'desktop'
          ? verticalsTable(page).getByRole('rowheader')
          : page
              .getByRole('main')
              .getByRole('listitem')
              .filter({ hasText: 'Створено' });

      await forEachTheme(page, async (theme) => {
        const name = (state: string) =>
          `17-admin-verticals-${state}-${viewport}-${theme}.png`;
        await page.goto('/settings/verticals');
        await expect(items).toHaveCount(2);
        await expect(items.first()).toContainText('Гемблінг');
        await expect(items.last()).toContainText('Крипто');
        await expect(
          page
            .getByText(
              viewport === 'mobile' ? 'Створено 30.10.2026' : '30.10.2026',
              { exact: true },
            )
            .filter({ visible: true }),
        ).toHaveCount(2);
        // The seed's active users: 7 in Гемблінг, 4 in Крипто (CLAUDE.md §8; Head HR and HR are in both).
        await expect(
          page.getByRole('link', { name: '7 користувачів' }),
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: '4 користувачі' }),
        ).toBeVisible();
        await captureScreen(page, testInfo, name('list'));

        await page.getByRole('button', { name: t.verticals.create }).click();
        const dialog = openDialog(page);
        const input = dialog.getByLabel(dialogT.nameLabel);
        await expect(input).toBeFocused();
        await captureScreen(page, testInfo, name('create'));

        await input.fill('Гемблінг');
        await dialog
          .getByRole('button', { name: dialogT.createSubmit })
          .click();
        await expect(dialog.getByText(dialogErrors.duplicate)).toBeVisible();
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await captureScreen(page, testInfo, name('duplicate'));
        await dialog.getByRole('button', { name: t.common.cancel }).click();
        await expect(dialog).toHaveCount(0);

        await page
          .getByRole('button', { name: `${t.verticals.rename}: Крипто` })
          .click();
        await expect(
          dialog.getByText(dialogT.currentName.replace('{name}', 'Крипто')),
        ).toBeVisible();
        await expect(dialog.getByText(dialogErrors.unchanged)).toBeVisible();
        await expect(
          dialog.getByRole('button', { name: dialogT.renameSubmit }),
        ).toBeDisabled();
        await captureScreen(page, testInfo, name('rename'));
        await dialog.getByRole('button', { name: t.common.cancel }).click();
        await expect(dialog).toHaveCount(0);

        await page.route('**/api/v1/settings/verticals', (route) =>
          route.fulfill({ json: { items: [] } }),
        );
        await page.goto('/settings/verticals');
        await expect(page.getByText(t.verticals.empty.title)).toBeVisible();
        await expect(
          page.getByRole('button', { name: t.verticals.create }),
        ).toHaveCount(1);
        await captureScreen(page, testInfo, name('empty'));
        await page.unroute('**/api/v1/settings/verticals');
      });
    } finally {
      await context.close();
    }
  }
  expect(saves).toEqual({ create: 4, rename: 0 });
});
