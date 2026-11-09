import { expect, test, type Page, type Route } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { E2E_ORIGIN, sessionFile, type E2EUser } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import {
  DELETED_VACANCY,
  VISIBLE_VACANCIES,
  demoVacancy,
} from '../support/vacancy-demo';
import { captureScreen, forEachTheme, viewportOf } from './screens';

const t = messages.vacancies;

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

const rowCount = (page: Page, isMobile: boolean) =>
  isMobile
    ? page
        .getByRole('list', { name: t.caption, exact: true })
        .getByRole('listitem')
    : page
        .getByRole('table', { name: t.caption, exact: true })
        .getByRole('row')
        .filter({ has: page.getByRole('rowheader') });

/** The first row's preview is fetched by the client, so a capture must wait for it to be deterministic. */
const previewReady = (page: Page, isMobile: boolean) =>
  isMobile
    ? Promise.resolve()
    : expect(
        page
          .getByRole('complementary', { name: t.previewLabel })
          .getByRole('heading', { level: 2 })
          .first(),
      ).toBeVisible();

const LIST_ROLES = [
  { user: 'admin@demo', role: 'admin' },
  { user: 'head.recruiter.gambling@demo', role: 'head-recruiter' },
  { user: 'recruiter1.gambling@demo', role: 'recruiter' },
  { user: 'vasyl.tl@demo', role: 'team-lead' },
  { user: 'head.hr@demo', role: 'head-hr' },
] as const satisfies readonly { user: E2EUser; role: string }[];

for (const { user, role } of LIST_ROLES) {
  test.describe(user, () => {
    test.use({ storageState: sessionFile(user) });

    test(`captures «Вакансії» as ${user} [SHOT-01..03, STORY-VAC-04-1]`, async ({
      page,
      isMobile,
    }, testInfo) => {
      await freezeClock(page);
      const viewport = viewportOf(testInfo);
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, '/vacancies');
        await expect(rowCount(page, isMobile)).toHaveCount(
          VISIBLE_VACANCIES[user].length,
        );
        await previewReady(page, isMobile);
        await checkAccessibility(page, testInfo);
        await captureScreen(
          page,
          testInfo,
          `30-${role}-vacancies-list-${viewport}-${theme}.png`,
          'phase-2',
        );
      });
    });
  });
}

test.describe('finance@demo', () => {
  test.use({ storageState: sessionFile('finance@demo') });

  test('captures the in-shell 404 Finance gets for «Вакансії» [SHOT-01..03, VIS-02]', async ({
    page,
  }, testInfo) => {
    await freezeClock(page);
    await forEachTheme(page, async (theme) => {
      const response = await page.goto('/vacancies');
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages.errors.notFoundTitle,
        }),
      ).toBeVisible();
      await captureScreen(
        page,
        testInfo,
        `30-finance-vacancies-denied-${viewportOf(testInfo)}-${theme}.png`,
        'phase-2',
      );
    });
  });
});

const CARDS = [
  {
    user: 'admin@demo',
    role: 'admin',
    position: 1,
    state: 'detail',
    title: 'urgent card with the team and terms',
  },
  {
    user: 'vasyl.tl@demo',
    role: 'team-lead',
    position: 9,
    state: 'detail-long-title',
    title: 'a very long title',
  },
  {
    user: 'recruiter1.gambling@demo',
    role: 'recruiter',
    position: 10,
    state: 'detail-no-team-lead',
    title: 'a recruiter-initiated vacancy without a Team Lead',
  },
] as const satisfies readonly {
  user: E2EUser;
  role: string;
  position: number;
  state: string;
  title: string;
}[];

for (const card of CARDS) {
  test.describe(`${card.user} card`, () => {
    test.use({ storageState: sessionFile(card.user) });

    test(`captures the read-only card of ${card.title} [SHOT-01..03, STORY-VAC-04-2]`, async ({
      page,
    }, testInfo) => {
      await freezeClock(page);
      const vacancy = demoVacancy(card.position);
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, `/vacancies/${vacancy.id}`);
        await expect(
          page.getByRole('heading', { level: 1, name: vacancy.title }),
        ).toBeVisible();
        await checkAccessibility(page, testInfo);
        await captureScreen(
          page,
          testInfo,
          `31-${card.role}-vacancy-${card.state}-${viewportOf(testInfo)}-${theme}.png`,
          'phase-2',
        );
      });
    });
  });
}

test.describe('head.recruiter.gambling@demo states', () => {
  test.use({ storageState: sessionFile('head.recruiter.gambling@demo') });

  test('captures the card a Head Recruiter cannot open: foreign vertical and deleted [SHOT-01..03, VIS-02, STORY-VAC-04-2]', async ({
    page,
  }, testInfo) => {
    await freezeClock(page);
    await forEachTheme(page, async (theme) => {
      const response = await page.goto(`/vacancies/${demoVacancy(3).id}`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: messages.errors.notFoundTitle,
        }),
      ).toBeVisible();
      await captureScreen(
        page,
        testInfo,
        `32-head-recruiter-vacancy-not-found-${viewportOf(testInfo)}-${theme}.png`,
        'phase-2',
      );
    });
    expect(
      (
        await page.request.get(`/vacancies/${demoVacancy(DELETED_VACANCY).id}`)
      ).status(),
    ).toBe(404);
  });

  test('captures a title search narrowed to three vacancies with a reset [SHOT-01..03, STORY-VAC-04-1]', async ({
    page,
    isMobile,
  }, testInfo) => {
    await freezeClock(page);
    await forEachTheme(page, async (theme) => {
      await openHydrated(page, '/vacancies?q=tiktok&status=ON_HOLD');
      await expect(rowCount(page, isMobile)).toHaveCount(1);
      await page.getByRole('button', { name: t.resetFilters }).first().click();
      await expect(rowCount(page, isMobile)).toHaveCount(
        VISIBLE_VACANCIES['head.recruiter.gambling@demo'].length,
      );
      await page
        .getByRole('searchbox', { name: t.searchLabel, exact: true })
        .fill('tiktok');
      await expect(rowCount(page, isMobile)).toHaveCount(3);
      await expect(page.getByText(/^Показано 3/)).toBeVisible();
      await previewReady(page, isMobile);
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `32-head-recruiter-vacancies-filtered-${viewportOf(testInfo)}-${theme}.png`,
        'phase-2',
      );
    });
  });
});

test.describe('admin@demo states', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  test('captures filtered-empty with its reset [SHOT-01..03, UI-06]', async ({
    page,
  }, testInfo) => {
    await freezeClock(page);
    await forEachTheme(page, async (theme) => {
      await openHydrated(page, '/vacancies');
      await page
        .getByRole('searchbox', { name: t.searchLabel, exact: true })
        .fill('Немає такої вакансії');
      await expect(
        page.getByText(t.filteredEmpty.title, { exact: true }),
      ).toBeVisible();
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `32-admin-vacancies-filtered-empty-${viewportOf(testInfo)}-${theme}.png`,
        'phase-2',
      );
    });
  });

  test('captures the header vertical switcher narrowing the list to «Крипто» [SHOT-01..03, D83]', async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'the header vertical switcher is hidden on mobile');
    await freezeClock(page);
    const crypto = VISIBLE_VACANCIES['admin@demo'].filter(
      (position) => demoVacancy(position).vertical === 'crypto',
    );
    await forEachTheme(page, async (theme) => {
      await page
        .context()
        .addCookies([{ name: 'vertical', value: 'all', url: E2E_ORIGIN }]);
      await openHydrated(page, '/vacancies');
      await expect(rowCount(page, isMobile)).toHaveCount(
        VISIBLE_VACANCIES['admin@demo'].length,
      );
      await page
        .getByRole('button', {
          name: messages.shell.verticalFilter.replace(
            '{name}',
            messages.shell.allVerticals,
          ),
          exact: true,
        })
        .click();
      await page
        .getByRole('menuitemradio', { name: 'Крипто', exact: true })
        .click();
      await expect(rowCount(page, isMobile)).toHaveCount(crypto.length);
      await expect(
        page.getByRole('button', {
          name: messages.shell.verticalFilter.replace('{name}', 'Крипто'),
          exact: true,
        }),
      ).toBeVisible();
      await previewReady(page, isMobile);
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `32-admin-vacancies-header-vertical-crypto-desktop-${theme}.png`,
        'phase-2',
      );
    });
  });

  test('captures the refreshing, error and empty list states [SHOT-01..03, UI-06]', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await freezeClock(page);
    const viewport = viewportOf(testInfo);
    await forEachTheme(page, async (theme) => {
      await openHydrated(page, '/vacancies');
      let mode: 'pending' | 'error' | 'empty' = 'pending';
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const matcher = (url: URL) =>
        url.pathname === '/api/v1/vacancies' &&
        url.searchParams.get('limit') === '100';
      const handler = async (route: Route) => {
        if (mode === 'pending') await pending;
        await route.fulfill(
          mode === 'empty'
            ? { json: { items: [], nextCursor: null, prevCursor: null } }
            : { status: 503, json: { code: 'INTERNAL_ERROR' } },
        );
      };
      await page.route(matcher, handler);
      try {
        await page.evaluate(() =>
          window.history.pushState(null, '', '/vacancies?limit=100'),
        );
        await expect(
          page.getByText(t.refreshing, { exact: true }),
        ).toBeVisible();
        await expect(
          page
            .getByRole('region', { name: t.resultsLabel, exact: true })
            .locator('[data-slot="card"]')
            .first(),
        ).toHaveCSS('opacity', '0.6');
        await captureScreen(
          page,
          testInfo,
          `32-admin-vacancies-refreshing-${viewport}-${theme}.png`,
          'phase-2',
        );
        mode = 'error';
        release();
        await expect(
          page.getByText(messages.states.errorTitle, { exact: true }),
        ).toBeVisible({ timeout: 20_000 });
        await checkAccessibility(page, testInfo);
        await captureScreen(
          page,
          testInfo,
          `32-admin-vacancies-error-${viewport}-${theme}.png`,
          'phase-2',
        );
        mode = 'empty';
        await page
          .getByRole('button', { name: messages.common.retry, exact: true })
          .click();
        await expect(
          page.getByText(t.empty.title, { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: t.resetFilters }),
        ).toHaveCount(0);
        await checkAccessibility(page, testInfo);
        await captureScreen(
          page,
          testInfo,
          `32-admin-vacancies-empty-${viewport}-${theme}.png`,
          'phase-2',
        );
      } finally {
        release();
        await page.unroute(matcher, handler);
      }
    });
  });

  test('captures the preview failing on its own while the list stays usable [SHOT-01..03, UI-06]', async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'the side preview exists on wide screens only');
    test.setTimeout(120_000);
    await freezeClock(page);
    const target = demoVacancy(2);
    await forEachTheme(page, async (theme) => {
      await openHydrated(page, '/vacancies');
      const failing = (url: URL) =>
        url.pathname === `/api/v1/vacancies/${target.id}`;
      await page.route(failing, (route) =>
        route.fulfill({ status: 503, json: { code: 'INTERNAL_ERROR' } }),
      );
      await rowCount(page, false)
        .filter({ hasText: target.number })
        .getByRole('button')
        .click();
      await expect(
        page
          .getByRole('complementary', { name: t.previewLabel })
          .getByText(messages.states.errorTitle, { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `32-admin-vacancies-preview-error-desktop-${theme}.png`,
        'phase-2',
      );
      await page.unroute(failing);
    });
  });

  test('captures the preview following a selected row [SHOT-01..03, VIS-01]', async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'the side preview exists on wide screens only');
    await freezeClock(page);
    const target = demoVacancy(9);
    await forEachTheme(page, async (theme) => {
      await openHydrated(page, '/vacancies');
      await rowCount(page, false)
        .filter({ hasText: target.number })
        .getByRole('button')
        .click();
      await expect(
        page
          .getByRole('complementary', { name: t.previewLabel })
          .getByRole('heading', { level: 2, name: target.title }),
      ).toBeVisible();
      await checkAccessibility(page, testInfo);
      await captureScreen(
        page,
        testInfo,
        `32-admin-vacancies-preview-selected-desktop-${theme}.png`,
        'phase-2',
      );
    });
  });
});
