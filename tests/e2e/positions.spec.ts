import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { Position, PositionList } from '../../lib/schemas/position';
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  mfaPendingSessionFile,
  sessionFile,
} from '../support/e2e-session';
import { DEMO_VACANCIES } from '../../server/db/seed/vacancies';
import { openHydrated } from '../support/hydration';
import { removeE2EPositions } from '../support/position-cleanup';
import { problemFulfill } from '../support/problem';

const t = messages.positions;
const PAGE = '/vacancies/positions';
/** Seeded inactive position of Гемблінг (server/db/seed/vacancies.ts). */
const SEEDED_INACTIVE = 'Саппорт-менеджер';
/** Every row this spec creates starts with this run's prefix; positions cannot be deleted, so the hook below removes them. */
const PREFIX = `Тест E2E ${Math.random().toString(36).slice(2, 8)}`;
const named = (label: string) => `${PREFIX} ${label}`;
const fill = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );

test.afterAll(async () => {
  await removeE2EPositions(PREFIX);
});

const notFound = (page: Page) =>
  page.getByRole('heading', { level: 1, name: messages.errors.notFoundTitle });
const createButton = (page: Page) =>
  page.getByRole('button', { name: t.create, exact: true });
const rowButton = (
  page: Page,
  action: 'rename' | 'deactivate' | 'reactivate',
  name: string,
) =>
  page.getByRole('button', {
    name: fill(t[`${action}Label`], { name }),
    exact: true,
  });

async function verticalId(request: APIRequestContext, name: string) {
  const response = await request.get('/api/v1/verticals');
  const { items } = (await response.json()) as {
    items: { id: string; name: string }[];
  };
  return items.find((item) => item.name === name)!.id;
}

async function createViaApi(
  request: APIRequestContext,
  vertical: string,
  name: string,
) {
  const response = await request.post('/api/v1/positions', {
    headers: MUTATION_HEADERS,
    data: { verticalId: vertical, name },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Position;
}

async function listedByName(request: APIRequestContext, name: string) {
  const response = await request.get('/api/v1/positions?status=all');
  const { items } = (await response.json()) as PositionList;
  return items.find((item) => item.name === name)!;
}

test.describe('Admin manages the catalog of every vertical [VAC-01, D76]', () => {
  test.use({ storageState: sessionFile('admin@demo') });
  test.describe.configure({ mode: 'serial' });

  test('groups positions by vertical, filters them and keeps the filter in the URL', async ({
    page,
    context,
  }) => {
    await openHydrated(page, PAGE);
    await expect(
      page.getByRole('heading', { level: 1, name: t.title, exact: true }),
    ).toBeVisible();
    for (const vertical of ['Гемблінг', 'Крипто'])
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: new RegExp(`^${vertical} · `),
        }),
      ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: /Показано/ }),
    ).toBeVisible();

    const filter = page.getByLabel(t.filterVertical, { exact: true });
    await filter.selectOption({ label: 'Крипто' });
    const crypto = await verticalId(page.request, 'Крипто');
    await expect(page).toHaveURL(new RegExp(`vertical=${crypto}`));
    await expect(
      page.getByText(fill(t.subtitleVertical, { vertical: 'Крипто' })),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
    await page.getByLabel(t.showInactive).check();
    await expect(page).toHaveURL(/inactive=1/);

    await page.reload();
    await expect(filter).toHaveValue(crypto);
    await expect(page.getByLabel(t.showInactive)).toBeChecked();

    await context.addCookies([
      { name: 'vertical', value: crypto, url: E2E_ORIGIN },
    ]);
    await openHydrated(page, PAGE);
    await expect(filter).toHaveValue(crypto);
  });

  test('counts only OPEN vacancies of a position, not drafts, paused, cancelled or deleted ones [ADR-013]', async ({
    page,
    isMobile,
  }) => {
    const ofPosition = DEMO_VACANCIES.filter(
      (seed) => seed.position === 'gambling-media-buyer-facebook',
    );
    const open = ofPosition.filter(
      (seed) => seed.status === 'OPEN' && !seed.deleted,
    ).length;
    expect(ofPosition.length).toBeGreaterThan(open);
    await openHydrated(page, PAGE);
    const name = 'Медіабаєр — Facebook';
    if (isMobile)
      await expect(
        page
          .getByRole('listitem')
          .filter({ hasText: name })
          .getByText(fill(t.openVacanciesLine, { count: String(open) })),
      ).toBeVisible();
    else
      await expect(
        page
          .getByRole('row')
          .filter({ has: page.getByRole('rowheader', { name, exact: true }) })
          .getByRole('cell')
          .nth(1),
      ).toHaveText(String(open));
  });

  test('warns about open vacancies before deactivating and changes nothing on cancel', async ({
    page,
  }) => {
    const { items } = (await (
      await page.request.get('/api/v1/positions?status=all')
    ).json()) as PositionList;
    const busy = items.find(
      (item) => item.isActive && (item.openVacanciesCount ?? 0) > 0,
    );
    expect(
      busy,
      'the seed has an active position with an open vacancy',
    ).toBeDefined();
    await openHydrated(page, PAGE);
    await rowButton(page, 'deactivate', busy!.name).click();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByRole('heading', {
        name: fill(t.deactivateDialog.title, { name: busy!.name }),
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText(/За цією посадою є \d+ відкрит/),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: messages.settings.common.cancel }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(rowButton(page, 'deactivate', busy!.name)).toBeFocused();
  });

  test('creates, blocks duplicates, renames, deactivates and reactivates a position', async ({
    page,
  }) => {
    const original = named('Адмін');
    const renamed = named('Адмін 2');
    const rival = named('Суперник');
    const posts: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/api/v1/positions')
      )
        posts.push(request.url());
    });
    await openHydrated(page, PAGE);

    await createButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: t.dialog.createTitle }),
    ).toBeVisible();
    await dialog.getByLabel(t.dialog.nameLabel).fill(original);
    await dialog.getByRole('button', { name: t.dialog.createSubmit }).click();
    await expect(
      dialog.getByText(t.dialog.errors.verticalRequired),
    ).toBeVisible();
    await dialog
      .getByLabel(t.dialog.verticalLabel)
      .selectOption({ label: 'Гемблінг' });
    await dialog.getByRole('button', { name: t.dialog.createSubmit }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(fill(t.toast.created, { name: original })),
    ).toBeVisible();
    const toast = page
      .locator('[data-slot="toast"]')
      .filter({ hasText: fill(t.toast.created, { name: original }) });
    await expect(
      toast.locator('xpath=ancestor-or-self::*[@aria-hidden="true"]'),
    ).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 0) < 768) {
      const stickyCreate = createButton(page).last();
      await expect
        .poll(async () => {
          const [toastBox, barBox] = await Promise.all([
            toast.boundingBox(),
            stickyCreate.boundingBox(),
          ]);
          return toastBox && barBox
            ? Math.floor(barBox.y - (toastBox.y + toastBox.height))
            : -1;
        })
        .toBeGreaterThanOrEqual(0);
    }
    await expect(rowButton(page, 'rename', original)).toBeVisible();
    await expect(page.locator(':focus')).toHaveText(original);
    expect(posts).toHaveLength(1);

    await createButton(page).click();
    await dialog
      .getByLabel(t.dialog.verticalLabel)
      .selectOption({ label: 'Гемблінг' });
    const nameField = dialog.getByLabel(t.dialog.nameLabel);
    await nameField.fill(original.toUpperCase());
    await dialog.getByRole('button', { name: t.dialog.createSubmit }).click();
    await expect(
      dialog.getByText(fill(t.dialog.errors.duplicate, { name: original })),
    ).toBeVisible();
    await expect(nameField).toHaveAttribute('aria-invalid', 'true');
    await expect(nameField).toBeFocused();
    expect(posts).toHaveLength(1);

    // Created behind the dialog's back: the cached list cannot know it, so the server answers 409.
    await createViaApi(
      page.request,
      await verticalId(page.request, 'Гемблінг'),
      rival,
    );
    await nameField.fill(rival);
    await dialog.getByRole('button', { name: t.dialog.createSubmit }).click();
    await expect(
      dialog.getByText(fill(t.dialog.errors.duplicate, { name: rival })),
    ).toBeVisible();
    await expect(nameField).toHaveValue(rival);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(createButton(page)).toBeFocused();

    await rowButton(page, 'rename', original).click();
    await expect(
      dialog.getByText(fill(t.dialog.currentName, { name: original })),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: t.dialog.renameSubmit }),
    ).toBeDisabled();
    await expect(dialog.getByText(t.dialog.errors.unchanged)).toBeVisible();
    await nameField.fill(renamed);
    await dialog.getByRole('button', { name: t.dialog.renameSubmit }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(fill(t.toast.renamed, { from: original, to: renamed })),
    ).toBeVisible();
    await expect(rowButton(page, 'rename', renamed)).toBeFocused();
    await expect(rowButton(page, 'rename', original)).toHaveCount(0);

    await rowButton(page, 'deactivate', renamed).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText(/За цією посадою є/)).toHaveCount(0);
    await confirm
      .getByRole('button', { name: t.deactivateDialog.submit })
      .click();
    await expect(confirm).toHaveCount(0);
    await expect(
      page.getByText(fill(t.toast.deactivated, { name: renamed })),
    ).toBeVisible();
    await expect(rowButton(page, 'deactivate', renamed)).toHaveCount(0);
    await expect(page.locator(':focus')).toHaveAttribute(
      'aria-label',
      /^Перейменувати: /,
    );

    await page.getByLabel(t.showInactive).check();
    await expect(rowButton(page, 'reactivate', renamed)).toBeVisible();
    await expect(
      page
        .getByText(t.status.inactive, { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await rowButton(page, 'reactivate', renamed).click();
    await expect(
      page.getByText(fill(t.toast.reactivated, { name: renamed })),
    ).toBeVisible();
    await expect(rowButton(page, 'deactivate', renamed)).toBeFocused();
  });

  test('shows the stale-version alert in the deactivate dialog and succeeds on the second try', async ({
    page,
  }) => {
    const current = named('Адмін 2');
    const bumped = named('Адмін 3');
    const stored = await listedByName(page.request, current);
    await openHydrated(page, PAGE);
    const patched = await page.request.patch(`/api/v1/positions/${stored.id}`, {
      headers: MUTATION_HEADERS,
      data: { expectedVersion: stored.version, name: bumped },
    });
    expect(patched.status()).toBe(200);

    await rowButton(page, 'deactivate', current).click();
    const dialog = page.getByRole('alertdialog');
    await dialog
      .getByRole('button', { name: t.deactivateDialog.submit })
      .click();
    await expect(dialog.getByRole('alert')).toHaveText(t.errors.stale);
    await expect(
      dialog.getByRole('heading', {
        name: fill(t.deactivateDialog.title, { name: bumped }),
      }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: t.deactivateDialog.submit })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(fill(t.toast.deactivated, { name: bumped })),
    ).toBeVisible();
  });
});

test.describe('Admin loses the 2FA level mid-session [SEC-CORE-09, wireframe §0]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('answers a refused reactivation and a refused create with the 2FA alert, keeps the data and sends the user to the code page', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname.startsWith('/api/v1/positions'),
      async (route) => {
        if (route.request().method() === 'GET') return route.fallback();
        await route.fulfill(await problemFulfill(401, 'MFA_REQUIRED'));
      },
    );
    await openHydrated(page, `${PAGE}?inactive=1`);
    const alert = page
      .getByRole('alert')
      .filter({ hasText: t.errors.mfaRequired });
    await expect(alert).toHaveCount(0);

    await rowButton(page, 'reactivate', SEEDED_INACTIVE).click();
    await expect(alert).toBeVisible();
    await expect(
      alert.getByRole('link', { name: messages.settings.common.mfaVerify }),
    ).toHaveAttribute(
      'href',
      `/mfa/verify?next=${encodeURIComponent(`${PAGE}?inactive=1`)}`,
    );
    await expect(rowButton(page, 'reactivate', SEEDED_INACTIVE)).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: /Показано/ }),
    ).toBeVisible();

    await createButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(t.dialog.verticalLabel)
      .selectOption({ label: 'Гемблінг' });
    await dialog.getByLabel(t.dialog.nameLabel).fill(named('Без 2FA'));
    await dialog.getByRole('button', { name: t.dialog.createSubmit }).click();
    await expect(dialog).toHaveCount(0);
    await expect(alert).toBeVisible();
    await expect(page.getByText(named('Без 2FA'))).toHaveCount(0);

    await alert
      .getByRole('link', { name: messages.settings.common.mfaVerify })
      .click();
    await expect(page).toHaveURL(/\/mfa\/verify\?next=/);
  });
});

test.describe('Head Recruiter manages only their own vertical', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });
  test.describe.configure({ mode: 'serial' });

  test('sees a flat list of Гемблінг without a vertical filter or vertical field, never another vertical', async ({
    page,
    browser,
  }) => {
    const foreign = named('Чужа');
    const admin = await browser.newContext({
      baseURL: E2E_ORIGIN,
      storageState: sessionFile('admin@demo'),
    });
    try {
      await createViaApi(
        admin.request,
        await verticalId(admin.request, 'Крипто'),
        foreign,
      );
    } finally {
      await admin.close();
    }
    await openHydrated(page, PAGE);
    await expect(
      page.getByText(fill(t.subtitleVertical, { vertical: 'Гемблінг' })),
    ).toBeVisible();
    await expect(
      page.getByLabel(t.filterVertical, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
    await expect(page.getByText(foreign)).toHaveCount(0);
    const listed = await page.request.get('/api/v1/positions?status=all');
    expect(
      ((await listed.json()) as PositionList).items.map((item) => item.name),
    ).not.toContain(foreign);

    await createButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(t.dialog.nameLabel)).toBeFocused();
    await expect(dialog.getByLabel(t.dialog.verticalLabel)).toHaveCount(0);
  });

  test('creates by keyboard, lands on the new row and tabs into its actions', async ({
    page,
  }) => {
    const name = named('Керівник');
    await openHydrated(page, PAGE);
    await createButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('dialog').getByLabel(t.dialog.nameLabel),
    ).toBeFocused();
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator(':focus')).toHaveText(name);
    await page.keyboard.press('Tab');
    await expect(rowButton(page, 'rename', name)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(rowButton(page, 'deactivate', name)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rowButton(page, 'deactivate', name)).toBeFocused();
  });

  test('keeps targets large enough and the layout inside the viewport', async ({
    page,
    isMobile,
  }) => {
    await openHydrated(page, PAGE);
    const list = page.getByRole('region', { name: t.listLabel });
    await expect(list).toBeVisible();
    const rename = page
      .getByRole('button', { name: /^Перейменувати: / })
      .first();
    await expect(rename).toBeVisible();
    const box = (await rename.boundingBox())!;
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (!isMobile) {
      expect(box.height).toBeGreaterThanOrEqual(32);
      await expect(page.getByRole('table')).toBeVisible();
      return;
    }
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: /Створено \d\d\.\d\d\.\d{4}/ })
        .first(),
    ).toBeVisible();
    const sticky = createButton(page);
    await expect(sticky).toBeInViewport({ ratio: 1 });
    expect((await sticky.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await page.locator('label', { hasText: t.showInactive }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
    await sticky.click();
    const sheet = page.getByRole('dialog');
    // The bottom sheet slides in (UI-F8); its resting place is the bottom edge of the screen.
    await expect
      .poll(async () => {
        const sheetBox = (await sheet.boundingBox())!;
        return Math.round(sheetBox.y + sheetBox.height);
      })
      .toBe(844);
    await expect(
      sheet.getByRole('button', { name: t.dialog.createSubmit }),
    ).toBeInViewport({ ratio: 1 });
  });
});

test.describe('Entry from «Вакансії» and the back link [VAC-01]', () => {
  for (const user of ['admin@demo', 'head.recruiter.gambling@demo'] as const) {
    test.describe(user, () => {
      test.use({ storageState: sessionFile(user) });

      test('opens the catalog and returns to the remembered vacancy list', async ({
        page,
      }) => {
        await openHydrated(page, '/vacancies?status=OPEN');
        const entry = page.getByRole('main').getByRole('link', {
          name: messages.vacancies.positionsEntry,
          exact: true,
        });
        await expect(entry).toBeVisible();
        expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(40);
        await entry.click();
        await expect(page).toHaveURL(/\/vacancies\/positions$/);
        await expect(
          page
            .getByRole('navigation')
            .getByRole('link', {
              name: messages.nav.vacancies,
              exact: true,
            })
            .first(),
        ).toHaveAttribute('aria-current', 'page');
        await page
          .getByRole('main')
          .getByRole('link', { name: t.backToVacancies, exact: true })
          .click();
        await expect(page).toHaveURL(/\/vacancies\?status=OPEN$/);
      });
    });
  }
});

test.describe('Everyone else gets the not-found page and no entry button [VIS-02, FIN-03]', () => {
  const others = [
    'recruiter1.gambling@demo',
    'vasyl.tl@demo',
    'hr@demo',
    'head.hr@demo',
    'finance@demo',
  ] as const;

  for (const user of others) {
    test.describe(user, () => {
      test.use({ storageState: sessionFile(user) });

      test('404 on the page and no «Довідник посад» button', async ({
        page,
      }) => {
        const response = await page.goto(PAGE);
        expect(response?.status()).toBe(404);
        await expect(notFound(page)).toBeVisible();
        await expect(page.getByRole('table')).toHaveCount(0);
        if (user === 'finance@demo') return;
        await page.goto('/vacancies');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: messages.vacancies.title,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: messages.vacancies.positionsEntry }),
        ).toHaveCount(0);
      });
    });
  }

  test.describe('Admin before the 2FA code', () => {
    test.use({ storageState: mfaPendingSessionFile });

    test('is sent to the code page with the way back', async ({ page }) => {
      await page.goto(PAGE);
      await expect(page).toHaveURL(
        /\/mfa\/verify\?next=%2Fvacancies%2Fpositions$/,
      );
    });
  });
});
