import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { sessionFile, type E2EUser } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { checkAccessibility } from '../support/accessibility';
import { captureScreen, forEachTheme, viewportOf } from './screens';
import { notFound } from './support/vacancy-create';
import { freezeGalleryClock } from './support/vacancy-gallery';

const t = messages.vacancies;
const CREATE = { name: t.draft.create, exact: true };

const EMPTY_LIST = [
  {
    user: 'head.recruiter.gambling@demo',
    role: 'head-recruiter',
    author: true,
  },
  { user: 'recruiter1.gambling@demo', role: 'recruiter', author: true },
  { user: 'vasyl.tl@demo', role: 'team-lead', author: false },
  { user: 'head.hr@demo', role: 'head-hr', author: false },
] as const satisfies readonly {
  user: E2EUser;
  role: string;
  author: boolean;
}[];

for (const { user, role, author } of EMPTY_LIST)
  test.describe(`empty vacancy list: ${role} [SHOT-01..03, ux §10]`, () => {
    test.use({ storageState: sessionFile(user) });

    test(
      author ? 'offers the create action' : 'explains without an action',
      async ({ page, isMobile }, info) => {
        test.setTimeout(120_000);
        await freezeGalleryClock(page);
        await page.route(
          (url) => url.pathname === '/api/v1/vacancies',
          (route) =>
            route.request().method() === 'GET'
              ? route.fulfill({
                  json: { items: [], nextCursor: null, prevCursor: null },
                })
              : route.fallback(),
        );
        await page.route('**/api/v1/vacancies/drafts/count', (route) =>
          route.fulfill({ json: { count: 0 } }),
        );
        await forEachTheme(page, async (theme) => {
          await openHydrated(page, '/vacancies');
          await expect(
            page.getByText(t.empty.title, { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole('link', CREATE).filter({ visible: true }),
          ).toHaveCount(author ? 2 : 0);
          await checkAccessibility(page, info);
          if (role === 'team-lead' && theme === 'light' && !isMobile)
            await captureScreen(
              page,
              info,
              `32-${role}-vacancies-empty-${viewportOf(info)}-${theme}.png`,
              'phase-2',
            );
        });
      },
    );
  });

const DENIED = [
  { user: 'hr@demo', role: 'hr' },
  { user: 'head.hr@demo', role: 'head-hr' },
  { user: 'vasyl.tl@demo', role: 'team-lead' },
  { user: 'finance@demo', role: 'finance' },
] as const satisfies readonly { user: E2EUser; role: string }[];

for (const { user, role } of DENIED)
  test.describe(`new vacancy route denied: ${role} [SHOT-01..03, VIS-02]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('answers the in-shell 404', async ({ page, isMobile }, info) => {
      await freezeGalleryClock(page);
      await forEachTheme(page, async (theme) => {
        const response = await page.goto('/vacancies/new');
        expect(response?.status()).toBe(404);
        await expect(notFound(page)).toBeVisible();
        await expect(
          page.getByRole('link', { name: messages.vacancyForm.actions.leave }),
        ).toHaveCount(0);
        await checkAccessibility(page, info);
        if (role === 'hr' && theme === 'light' && !isMobile)
          await captureScreen(
            page,
            info,
            `40-${role}-vacancy-form-denied-${viewportOf(info)}-${theme}.png`,
            'phase-2',
          );
      });
    });
  });
