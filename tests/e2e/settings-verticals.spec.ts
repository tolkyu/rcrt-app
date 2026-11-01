import { test as base, expect, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  signIn,
  signInWithTotp,
} from '../support/e2e-session';

const t = messages.settings;
const dialogErrors = t.verticals.dialog.errors;

/** One admin@demo exists, so this spec runs only in the desktop project; mobile layout via viewport. */
const test = base.extend<object, { adminState: string | undefined }>({
  adminState: [
    async ({ browser }, provide, workerInfo) => {
      if (workerInfo.project.use.isMobile) return provide(undefined);
      const context = await browser.newContext({ baseURL: E2E_ORIGIN });
      await signInWithTotp(context.request, 'admin@demo');
      const path = `${workerInfo.project.outputDir}/admin-${workerInfo.workerIndex}.json`;
      await context.storageState({ path });
      await context.close();
      await provide(path);
    },
    { scope: 'worker' },
  ],
  storageState: ({ adminState }, provide) => provide(adminState),
});

test.describe.configure({ mode: 'default' });
test.skip(
  ({ isMobile }) => isMobile,
  'single seeded Admin; mobile layout via viewport',
);

const verticalsTable = (page: Page) => page.getByRole('table');
const openDialog = (page: Page) => page.getByRole('dialog');

test('Admin lands on «Налаштування → Вертикалі» and sees every vertical with user counts [UI-04-1, STORY-ROLE-03-1]', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/settings\/verticals$/);
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
  const box = await openDialog(page).boundingBox();
  expect(box && Math.round(box.y + box.height)).toBe(844);
});

test('roles without settings permissions get the not-found page and 404 from the API [VIS-02, STORY-ROLE-03-1]', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: E2E_ORIGIN });
  try {
    await signIn(context.request, 'head.hr@demo');
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
    await expect(page).toHaveURL(/\/profile$/);
  } finally {
    await context.close();
  }
});
