import { expect, test, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { Position } from '../../lib/schemas/position';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import {
  E2E_ORIGIN,
  mfaPendingSessionFile,
  sessionFile,
  type E2EUser,
} from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { captureScreen, forEachTheme, viewportOf } from './screens';

const t = messages.positions;
const PAGE = '/vacancies/positions';
const LONG_NAME =
  'Старший спеціаліст із закупівлі трафіку та масштабування кампаній Facebook Ads';
const FACEBOOK = 'Медіабаєр — Facebook';
const AFFILIATE = 'Афілейт-менеджер';
const SUPPORT = 'Саппорт-менеджер';
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

const positionId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Verticals {
  readonly gambling: string;
  readonly crypto: string;
}

async function verticalIds(page: Page): Promise<Verticals> {
  const response = await page.request.get('/api/v1/verticals');
  const { items } = (await response.json()) as {
    items: { id: string; name: string }[];
  };
  const idOf = (name: string) => items.find((item) => item.name === name)?.id;
  return { gambling: idOf('Гемблінг')!, crypto: idOf('Крипто') ?? '' };
}

const entry = (
  n: number,
  verticalId: string,
  name: string,
  open: number,
  createdAt: string,
  isActive = true,
): Position => ({
  id: positionId(n),
  verticalId,
  name,
  isActive,
  version: 1,
  createdAt,
  openVacanciesCount: open,
});

/** Seeded Ukrainian catalog with the shapes the wireframe asks for: two open vacancies, none, a 78-character name, inactive rows in both verticals. */
const catalogOf = (v: Verticals, scope: 'all' | 'gambling'): Position[] => {
  const gambling = [
    entry(1, v.gambling, FACEBOOK, 2, '2026-10-15T09:00:00.000Z'),
    entry(2, v.gambling, LONG_NAME, 0, '2026-10-20T09:00:00.000Z'),
    entry(3, v.gambling, AFFILIATE, 0, '2026-10-22T09:00:00.000Z'),
    entry(4, v.gambling, 'Крео-дизайнер', 1, '2026-10-25T09:00:00.000Z'),
    entry(5, v.gambling, SUPPORT, 0, '2026-10-27T09:00:00.000Z', false),
  ];
  const crypto = [
    entry(6, v.crypto, 'Трейдер-аналітик', 1, '2026-10-30T09:00:00.000Z'),
    entry(
      7,
      v.crypto,
      'Community-менеджер',
      0,
      '2026-10-31T09:00:00.000Z',
      false,
    ),
  ];
  return scope === 'all' ? [...gambling, ...crypto] : gambling;
};

/** The list the browser sees; the server-rendered copy is detached so these fixtures, not the shared database, drive the screen. */
interface Catalog {
  items: Position[];
  mode: 'ok' | 'hold' | 'fail';
  held: Promise<void>;
  release: () => void;
  hold: () => void;
}

const HYDRATED_KEY = String.raw`queryHash\":\"[\\\"positions`;
const DETACHED_KEY = String.raw`queryHash\":\"[\\\"positionsDetached`;

async function stageCatalog(page: Page): Promise<Catalog> {
  let open: () => void = () => undefined;
  const catalog: Catalog = {
    items: [],
    mode: 'ok',
    held: Promise.resolve(),
    release: () => {
      catalog.mode = 'ok';
      open();
    },
    hold: () => {
      catalog.mode = 'hold';
      catalog.held = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
  };
  await page.route(
    (url) => url.pathname === PAGE,
    async (route) => {
      if (route.request().resourceType() !== 'document')
        return route.fallback();
      const response = await route.fetch();
      const headers = response.headers();
      delete headers['content-length'];
      delete headers['content-encoding'];
      await route.fulfill({
        status: response.status(),
        headers,
        body: (await response.text()).replaceAll(HYDRATED_KEY, DETACHED_KEY),
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/v1/positions',
    async (route) => {
      if (route.request().method() === 'GET') {
        if (catalog.mode === 'hold') await catalog.held;
        if (catalog.mode === 'fail')
          return route.fulfill({
            status: 503,
            json: { code: 'INTERNAL_ERROR' },
          });
        return route.fulfill({ json: { items: catalog.items } });
      }
      const input = route.request().postDataJSON() as {
        verticalId: string;
        name: string;
      };
      const created: Position = {
        id: positionId(90),
        verticalId: input.verticalId,
        name: input.name,
        isActive: true,
        version: 1,
        createdAt: FIXED_CLOCK_ISO,
        openVacanciesCount: null,
      };
      catalog.items = [...catalog.items, { ...created, openVacanciesCount: 0 }];
      await route.fulfill({ status: 201, json: created });
    },
  );
  return catalog;
}

interface RoleSpec {
  readonly user: E2EUser;
  readonly role: string;
  readonly grouped: boolean;
}
const ADMIN: RoleSpec = { user: 'admin@demo', role: 'admin', grouped: true };
const HEAD: RoleSpec = {
  user: 'head.recruiter.gambling@demo',
  role: 'head-recruiter',
  grouped: false,
};

type Theme = 'light' | 'dark';

async function capture(
  page: Page,
  testInfo: Parameters<typeof captureScreen>[1],
  role: string,
  state: string,
  theme: Theme,
  options?: Parameters<typeof captureScreen>[4],
) {
  await checkAccessibility(page, testInfo);
  await captureScreen(
    page,
    testInfo,
    `33-${role}-positions-${state}-${viewportOf(testInfo)}-${theme}.png`,
    'phase-2',
    options,
  );
}

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
const listReady = (page: Page) =>
  expect(
    page.getByText(FACEBOOK, { exact: true }).filter({ visible: true }),
  ).toBeVisible();

/** Stages the catalog for this role, opens the page once per theme and runs `step` with the list rendered. */
async function eachTheme(
  page: Page,
  role: RoleSpec,
  options: {
    items?: (list: Position[]) => Position[];
    search?: string;
    ready?: boolean;
  },
  step: (theme: Theme, catalog: Catalog) => Promise<void>,
) {
  await freezeClock(page);
  const verticals = await verticalIds(page);
  const catalog = await stageCatalog(page);
  const base = catalogOf(verticals, role.grouped ? 'all' : 'gambling');
  await forEachTheme(page, async (theme) => {
    await page
      .context()
      .addCookies([{ name: 'vertical', value: 'all', url: E2E_ORIGIN }]);
    catalog.items = options.items ? options.items(base) : base;
    catalog.release();
    await openHydrated(page, `${PAGE}${options.search ?? ''}`);
    if (options.ready !== false) await listReady(page);
    await step(theme, catalog);
  });
}

for (const role of [ADMIN, HEAD]) {
  test.describe(`${role.user} catalog screens`, () => {
    test.use({ storageState: sessionFile(role.user) });

    test(`captures the list, grouped by vertical for several, flat for one [SHOT-01..03, VAC-01]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(page, role, {}, async (theme) => {
        await expect(
          page.getByRole('heading', { level: 1, name: t.title, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { level: 2 }).filter({ visible: true }),
        ).toHaveCount(role.grouped ? 2 : 0);
        await expect(
          page.getByText(LONG_NAME, { exact: true }).filter({ visible: true }),
        ).toBeVisible();
        await capture(page, testInfo, role.role, 'list', theme);
      });
    });

    test(`captures the inactive rows revealed with their «Активувати» action [SHOT-01..03, VAC-01]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(page, role, {}, async (theme) => {
        await page.getByLabel(t.showInactive).check();
        await expect(rowButton(page, 'reactivate', SUPPORT)).toBeVisible();
        await capture(page, testInfo, role.role, 'list-inactive', theme);
      });
    });

    test(`captures the delayed list as a skeleton with the filters in place [SHOT-01..03, UI-06]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(page, role, { ready: false }, async (theme, catalog) => {
        catalog.hold();
        await page.reload();
        await expect(
          page.getByRole('status').filter({ hasText: messages.states.loading }),
        ).toBeAttached();
        await expect(
          page.getByRole('heading', { level: 1, name: t.title, exact: true }),
        ).toBeVisible();
        await capture(page, testInfo, role.role, 'loading', theme);
        catalog.release();
        await listReady(page);
      });
    });

    test(`captures the empty catalog with its create action [SHOT-01..03, UI-06]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(
        page,
        role,
        { items: () => [], ready: false },
        async (theme) => {
          await expect(
            page.getByText(t.empty.title, { exact: true }),
          ).toBeVisible();
          await capture(page, testInfo, role.role, 'empty', theme);
        },
      );
    });

    test(`captures a vertical where every position is inactive [SHOT-01..03, UI-06]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(
        page,
        role,
        {
          items: (list) => list.map((item) => ({ ...item, isActive: false })),
          ready: false,
        },
        async (theme) => {
          await expect(
            page.getByText(t.emptyActive.title, { exact: true }),
          ).toBeVisible();
          await capture(page, testInfo, role.role, 'all-inactive', theme);
        },
      );
    });

    test(`captures the list failing with its retry [SHOT-01..03, UI-06]`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await eachTheme(page, role, { ready: false }, async (theme, catalog) => {
        catalog.mode = 'fail';
        await page.reload();
        await expect(
          page.getByText(messages.states.errorTitle, { exact: true }),
        ).toBeVisible({ timeout: 20_000 });
        await capture(page, testInfo, role.role, 'error', theme);
        catalog.release();
        await page
          .getByRole('button', { name: messages.common.retry, exact: true })
          .click();
        await listReady(page);
      });
    });

    test(`captures the create dialog: blank, invalid, duplicate of an active and of an inactive name [SHOT-01..03, VAC-01]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(page, role, {}, async (theme) => {
        const dialog = page.getByRole('dialog');
        const name = dialog.getByLabel(t.dialog.nameLabel);
        const submit = dialog.getByRole('button', {
          name: t.dialog.createSubmit,
        });
        const choose = () =>
          role.grouped
            ? dialog
                .getByLabel(t.dialog.verticalLabel)
                .selectOption({ label: 'Гемблінг' })
            : Promise.resolve();

        await createButton(page).click();
        await expect(
          dialog.getByRole('heading', { name: t.dialog.createTitle }),
        ).toBeVisible();
        await expect(dialog.getByLabel(t.dialog.verticalLabel)).toHaveCount(
          role.grouped ? 1 : 0,
        );
        await capture(page, testInfo, role.role, 'create', theme);

        if (role.grouped) {
          await name.fill('А');
          await submit.click();
          await expect(
            dialog.getByText(t.dialog.errors.verticalRequired),
          ).toBeVisible();
          await capture(
            page,
            testInfo,
            role.role,
            'create-invalid-vertical',
            theme,
          );
          await choose();
        }
        await name.fill('Я'.repeat(81));
        await name.blur();
        await expect(dialog.getByText(t.dialog.errors.tooLong)).toBeVisible();
        await capture(
          page,
          testInfo,
          role.role,
          'create-invalid-length',
          theme,
        );

        await name.fill(FACEBOOK.toUpperCase());
        await submit.click();
        await expect(
          dialog.getByText(fill(t.dialog.errors.duplicate, { name: FACEBOOK })),
        ).toBeVisible();
        await capture(page, testInfo, role.role, 'create-duplicate', theme);

        await name.fill(SUPPORT);
        await submit.click();
        await expect(
          dialog.getByText(
            fill(t.dialog.errors.duplicateInactive, { name: SUPPORT }),
          ),
        ).toBeVisible();
        await capture(
          page,
          testInfo,
          role.role,
          'create-duplicate-inactive',
          theme,
        );
      });
    });

    test(`captures the rename dialog, then the stale-version alert [SHOT-01..03, VAC-01]`, async ({
      page,
    }, testInfo) => {
      await page.route(
        (url) => url.pathname.startsWith('/api/v1/positions/'),
        async (route) =>
          route.fulfill(await problemFulfill(409, 'STALE_STATE')),
      );
      await eachTheme(page, role, {}, async (theme) => {
        await rowButton(page, 'rename', FACEBOOK).click();
        const dialog = page.getByRole('dialog');
        await expect(
          dialog.getByText(fill(t.dialog.currentName, { name: FACEBOOK })),
        ).toBeVisible();
        await expect(dialog.getByText(t.dialog.errors.unchanged)).toBeVisible();
        await capture(page, testInfo, role.role, 'rename', theme);

        await dialog
          .getByLabel(t.dialog.nameLabel)
          .fill('Медіабаєр — Facebook Ads');
        await dialog
          .getByRole('button', { name: t.dialog.renameSubmit })
          .click();
        await expect(dialog.getByRole('alert')).toHaveText(t.errors.stale);
        await capture(page, testInfo, role.role, 'rename-stale', theme);
      });
    });

    test(`captures the deactivate confirmation without and with the open-vacancies warning [SHOT-01..03, VAC-01]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(page, role, {}, async (theme) => {
        const confirm = page.getByRole('alertdialog');
        await rowButton(page, 'deactivate', AFFILIATE).click();
        await expect(
          confirm.getByRole('heading', {
            name: fill(t.deactivateDialog.title, { name: AFFILIATE }),
          }),
        ).toBeVisible();
        await expect(confirm.getByText(/За цією посадою є/)).toHaveCount(0);
        await capture(page, testInfo, role.role, 'deactivate', theme);
        await confirm
          .getByRole('button', { name: messages.settings.common.cancel })
          .click();
        await expect(confirm).toHaveCount(0);

        await rowButton(page, 'deactivate', FACEBOOK).click();
        await expect(
          confirm.getByText(/За цією посадою є 2 відкриті вакансії/),
        ).toBeVisible();
        await capture(page, testInfo, role.role, 'deactivate-open', theme);
      });
    });

    test(`captures an 80-character name in the dialog without horizontal scroll [SHOT-01..03, UI-07]`, async ({
      page,
    }, testInfo) => {
      await eachTheme(page, role, {}, async (theme) => {
        await createButton(page).click();
        const dialog = page.getByRole('dialog');
        if (role.grouped)
          await dialog
            .getByLabel(t.dialog.verticalLabel)
            .selectOption({ label: 'Гемблінг' });
        await dialog.getByLabel(t.dialog.nameLabel).fill(`${LONG_NAME} 2`);
        await expect(dialog.getByText('80/80')).toBeVisible();
        expect(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        await capture(page, testInfo, role.role, 'long-name', theme);
      });
    });

    test(`captures the entry button in the «Вакансії» header [SHOT-01..03, VAC-01]`, async ({
      page,
    }, testInfo) => {
      await freezeClock(page);
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, '/vacancies');
        await expect(
          page.getByRole('main').getByRole('link', {
            name: messages.vacancies.positionsEntry,
            exact: true,
          }),
        ).toBeVisible();
        await capture(page, testInfo, role.role, 'entry', theme);
      });
    });
  });
}

test.describe('admin@demo only', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('captures the list narrowed to one vertical with its subtitle [SHOT-01..03, D83]', async ({
    page,
  }, testInfo) => {
    await eachTheme(page, ADMIN, {}, async (theme) => {
      await page
        .getByLabel(t.filterVertical, { exact: true })
        .selectOption({ label: 'Крипто' });
      await expect(
        page.getByText(fill(t.subtitleVertical, { vertical: 'Крипто' })),
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
      await capture(page, testInfo, 'admin', 'list-vertical', theme);
    });
  });

  test('captures a vertical without positions inside the grouped list [SHOT-01..03, UI-06]', async ({
    page,
  }, testInfo) => {
    await eachTheme(
      page,
      ADMIN,
      {
        items: (list) =>
          list.filter(
            (item) =>
              item.name !== 'Community-менеджер' &&
              item.name !== 'Трейдер-аналітик',
          ),
      },
      async (theme) => {
        await expect(
          page.getByText(t.groupEmpty).filter({ visible: true }),
        ).toBeVisible();
        await capture(page, testInfo, 'admin', 'empty-group', theme);
      },
    );
  });

  test('captures the toast after a created position [SHOT-01..03, VAC-01]', async ({
    page,
  }, testInfo) => {
    const name = 'Фахівець із залучення';
    await eachTheme(page, ADMIN, {}, async (theme) => {
      await createButton(page).click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByLabel(t.dialog.verticalLabel)
        .selectOption({ label: 'Гемблінг' });
      await dialog.getByLabel(t.dialog.nameLabel).fill(name);
      await dialog.getByRole('button', { name: t.dialog.createSubmit }).click();
      await expect(
        page.getByText(fill(t.toast.created, { name })),
      ).toBeVisible();
      await expect(rowButton(page, 'rename', name)).toBeVisible();
      await capture(page, testInfo, 'admin', 'created-toast', theme, {
        deviceViewport: true,
      });
    });
  });

  test('captures the 2FA alert after the second factor is lost mid-session [SHOT-01..03, SEC-CORE-09]', async ({
    page,
  }, testInfo) => {
    await page.route(
      (url) => url.pathname.startsWith('/api/v1/positions/'),
      async (route) => route.fulfill(await problemFulfill(401, 'MFA_REQUIRED')),
    );
    await eachTheme(page, ADMIN, { search: '?inactive=1' }, async (theme) => {
      await rowButton(page, 'reactivate', SUPPORT).click();
      await expect(
        page.getByRole('alert').filter({ hasText: t.errors.mfaRequired }),
      ).toBeVisible();
      await capture(page, testInfo, 'admin', 'mfa-alert', theme);
    });
  });
});

test.describe('admin@demo before the 2FA code', () => {
  test.use({ storageState: mfaPendingSessionFile });

  test('captures the redirect to the code page with the way back [SHOT-01..03, SEC-CORE-09]', async ({
    page,
  }, testInfo) => {
    await freezeClock(page);
    await forEachTheme(page, async (theme) => {
      await page.goto(PAGE);
      await expect(page).toHaveURL(
        /\/mfa\/verify\?next=%2Fvacancies%2Fpositions$/,
      );
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
      ).toBeVisible();
      await capture(page, testInfo, 'admin', 'mfa-redirect', theme);
    });
  });
});

const DENIED = [
  { user: 'recruiter1.gambling@demo', role: 'recruiter' },
  { user: 'finance@demo', role: 'finance' },
] as const satisfies readonly { user: E2EUser; role: string }[];

for (const { user, role } of DENIED) {
  test.describe(`${user} without the catalog`, () => {
    test.use({ storageState: sessionFile(user) });

    test('captures the in-shell 404 [SHOT-01..03, VIS-02, FIN-03]', async ({
      page,
    }, testInfo) => {
      await freezeClock(page);
      await forEachTheme(page, async (theme) => {
        const response = await page.goto(PAGE);
        expect(response?.status()).toBe(404);
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: messages.errors.notFoundTitle,
          }),
        ).toBeVisible();
        await capture(page, testInfo, role, 'denied', theme);
      });
    });
  });
}

test.describe('recruiter1.gambling@demo header', () => {
  test.use({ storageState: sessionFile('recruiter1.gambling@demo') });

  test('captures «Вакансії» without the catalog entry for a Recruiter [SHOT-01..03, VAC-01]', async ({
    page,
  }, testInfo) => {
    await freezeClock(page);
    await forEachTheme(page, async (theme) => {
      await openHydrated(page, '/vacancies');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages.vacancies.title,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: messages.vacancies.positionsEntry }),
      ).toHaveCount(0);
      await capture(page, testInfo, 'recruiter', 'no-entry', theme);
    });
  });
});
