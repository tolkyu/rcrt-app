import { expect, test } from '@playwright/test';
import { DEMO_VERTICALS } from '../../server/db/seed';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { checkAccessibility } from '../support/accessibility';
import { chooseOption } from '../support/select';
import { problemFulfill } from '../support/problem';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  captureScreen,
  forEachTheme,
  installFixedClock,
  viewportOf,
} from './screens';
import {
  t,
  field,
  vertical,
  position,
  choosePosition,
  publish,
  saveDraft,
  salaryFrom,
  salaryTo,
  CREATE_URL,
} from './support/vacancy-create';

const AUTHORS = [
  { user: 'admin@demo', role: 'admin' },
  { user: 'head.recruiter.gambling@demo', role: 'head-recruiter' },
  { user: 'recruiter1.gambling@demo', role: 'recruiter' },
] as const;

for (const { user, role } of AUTHORS) {
  test.describe(`vacancy form gallery: ${role} [SHOT-01..03, ux §10]`, () => {
    test.use({ storageState: sessionFile(user) });

    test('empty, picker, filled, validation and refused create states', async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000);
      await installFixedClock(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Toasts are judged against the pinned footer, so their capture keeps the real screen height.
      const shoot = async (state: string, theme: string, toast = false) => {
        await checkAccessibility(page, testInfo);
        await captureScreen(
          page,
          testInfo,
          `40-${role}-vacancy-form-${state}-${viewportOf(testInfo)}-${theme}.png`,
          'phase-2',
          { deviceViewport: toast },
        );
      };
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, '/vacancies/new');
        await expect(field(page, t.titleField.label)).toBeVisible();
        await shoot('empty', theme);
        await saveDraft(page).click();
        await expect(
          page.getByText(t.errors.titleRequired).first(),
        ).toBeVisible();
        await shoot('draft-errors', theme);
        if (await vertical(page).isEnabled())
          await chooseOption(page, vertical(page), 'Гемблінг');
        await position(page).click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await shoot('position-picker', theme);
        await page.keyboard.press('Escape');
        await choosePosition(page);
        await expect(page.locator('[data-slot="form-error"]')).toHaveCount(0);
        await field(page, t.headcount.label).fill('3');
        await field(page, t.location.label).fill('Київ, віддалено по Україні');
        await shoot('filled', theme);
        await salaryFrom(page).fill('4000');
        await salaryTo(page).fill('2500');
        await publish(page).click();
        await expect(
          page.getByText(t.errors.salaryMaxBelowMin).first(),
        ).toBeVisible();
        await shoot('salary-errors', theme);
        await salaryFrom(page).fill('');
        await salaryTo(page).fill('');
        await page.route(CREATE_URL, async (route) =>
          route.request().method() === 'POST'
            ? route.fulfill(await problemFulfill(429, 'RATE_LIMITED'))
            : route.fallback(),
        );
        await saveDraft(page).click();
        await expect(page.getByText(t.toast.rateLimited).first()).toBeVisible();
        await shoot('rate-limited', theme, true);
        await page.unroute(CREATE_URL);
      });
    });

    test('publish validation summary', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await installFixedClock(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await forEachTheme(page, async (theme) => {
        await openHydrated(
          page,
          `/vacancies/new?vertical=${DEMO_VERTICALS.gambling}`,
        );
        await publish(page).click();
        await expect(
          page
            .getByText(messages.vacancies.draftErrors.positionRequired)
            .first(),
        ).toBeVisible();
        await checkAccessibility(page, testInfo);
        await captureScreen(
          page,
          testInfo,
          `40-${role}-vacancy-form-publish-errors-${viewportOf(testInfo)}-${theme}.png`,
          'phase-2',
        );
      });
    });

    if (role === 'recruiter')
      test('the footer labels fit and the summary links reach the field at 320, 360 and 390 px [D124, ux 7]', async ({
        page,
        isMobile,
      }) => {
        test.skip(!isMobile, 'a phone layout');
        for (const width of [320, 360, 390]) {
          await page.setViewportSize({ width, height: 700 });
          await openHydrated(
            page,
            `/vacancies/new?vertical=${DEMO_VERTICALS.gambling}`,
          );
          await publish(page).click();
          const link = page
            .locator('[data-slot="form-error"] + ul')
            .getByRole('link', { name: t.position.label });
          await expect(link, `${width}px`).toBeVisible();
          await link.click();
          await expect(position(page), `${width}px`).toBeFocused();
          const footer = page.locator('[data-slot="form-page-footer"] > *');
          const fits = await footer.evaluateAll(
            (items, viewport) =>
              items.map((item) => {
                const box = item.getBoundingClientRect();
                return (
                  box.left >= 0 &&
                  box.right <= viewport &&
                  item.scrollWidth <= item.clientWidth + 1
                );
              }),
            width,
          );
          expect(fits, `${width}px`).toEqual([true, true, true]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            `${width}px`,
          ).toBe(true);
        }
      });
  });
}
