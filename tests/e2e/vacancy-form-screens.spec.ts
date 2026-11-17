import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
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
  teamLead,
  leadOption,
  LEADS,
  COUNT_URL,
  draftLimitReason,
  CREATE_URL,
} from './support/vacancy-create';
import {
  TITLE,
  ageCaches,
  freezeGalleryClock,
  holdNavigation,
  openCreateForm,
  shoot as shootGallery,
  type Capture,
} from './support/vacancy-gallery';

const POSITIONS_URL = /\/api\/v1\/positions\?/;
const TEAM_LEADS_URL = /\/verticals\/[^/]+\/team-leads$/;

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

    const form = (
      page: Page,
      info: TestInfo,
      state: string,
      theme: string,
      capture: Capture = {},
    ) => shootGallery(page, info, role, state, theme, capture, '40');
    const keep = (
      png: { mobile?: boolean; dark?: boolean },
      only = 'recruiter',
    ) => ({
      png: role === only ? png : (false as const),
    });

    if (role === 'admin')
      test('a vertical switch clears the position and the Team Lead and says so', async ({
        page,
      }, info) => {
        test.setTimeout(120_000);
        await freezeGalleryClock(page);
        await forEachTheme(page, async (theme) => {
          await openCreateForm(page);
          await choosePosition(page);
          await teamLead(page).click();
          await leadOption(page, LEADS.vasyl).click();
          await chooseOption(page, vertical(page), 'Крипто');
          await expect(
            page.getByText(t.vertical.resetBoth, { exact: true }),
          ).toBeVisible();
          await form(page, info, 'vertical-changed', theme, keep({}, 'admin'));
        });
      });

    if (role !== 'admin')
      test('a single vertical is preset and says why it cannot change', async ({
        page,
      }, info) => {
        test.setTimeout(120_000);
        await freezeGalleryClock(page);
        await forEachTheme(page, async (theme) => {
          await openHydrated(page, '/vacancies/new');
          await expect(vertical(page)).toBeDisabled();
          await expect(
            page.getByText(t.vertical.single, { exact: true }),
          ).toBeVisible();
          await form(page, info, 'vertical-preset', theme, { png: false });
        });
      });

    test('a vertical without positions or Team Leads offers none and says what to do', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      await freezeGalleryClock(page);
      const none = (route: Route) => route.fulfill({ json: { items: [] } });
      await forEachTheme(page, async (theme) => {
        await openCreateForm(page);
        // The page's own list is fresh for a minute: the empty answer is read once it has aged.
        await ageCaches(page);
        await page.route(POSITIONS_URL, none);
        await position(page).click();
        await expect(
          page.getByText(t.position.empty, { exact: true }),
        ).toBeVisible();
        await form(page, info, 'position-empty', theme, keep({}));
        await page.keyboard.press('Escape');
        if (role !== 'recruiter') {
          await page.route(TEAM_LEADS_URL, none);
          await teamLead(page).click();
          await expect(
            page.getByText(t.teamLead.empty, { exact: true }),
          ).toBeVisible();
          await form(page, info, 'team-lead-empty', theme, { png: false });
          await page.keyboard.press('Escape');
          await page.unroute(TEAM_LEADS_URL, none);
        }
        await page.unroute(POSITIONS_URL, none);
      });
    });

    test('the draft limit: save is disabled with its reason, and the server refusal keeps the values', async ({
      page,
      isMobile,
    }, info) => {
      test.setTimeout(180_000);
      await freezeGalleryClock(page);
      await page.route(COUNT_URL, (route) =>
        route.fulfill({ json: { count: 50 } }),
      );
      await forEachTheme(page, async (theme) => {
        await openCreateForm(page);
        await field(page, t.titleField.label).fill(TITLE);
        const asked = page.waitForRequest(COUNT_URL);
        await ageCaches(page);
        await page.evaluate(() =>
          window.dispatchEvent(new Event('visibilitychange')),
        );
        await asked;
        await expect(saveDraft(page)).toHaveAttribute('aria-disabled', 'true');
        if (isMobile) {
          await expect(
            page
              .locator('[data-slot="form-page-footer"] span[id]')
              .filter({ hasText: draftLimitReason }),
          ).toBeVisible();
          await form(page, info, 'draft-limit', theme, {
            deviceViewport: true,
            ...keep({ mobile: true }),
          });
        } else {
          await checkAccessibility(page, info);
          await saveDraft(page).hover();
          await expect(
            page
              .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
              .filter({ hasText: draftLimitReason }),
          ).toBeVisible();
          await form(page, info, 'draft-limit', theme, {
            deviceViewport: true,
            keepFocus: true,
            scan: false,
            ...keep({ mobile: true }),
          });
        }
      });
    });

    test('the server refusal at the limit shows an inline alert and keeps the values', async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      await freezeGalleryClock(page);
      await page.route(CREATE_URL, async (route) =>
        route.request().method() === 'POST'
          ? route.fulfill(await problemFulfill(409, 'DRAFT_LIMIT_REACHED'))
          : route.fallback(),
      );
      await forEachTheme(page, async (theme) => {
        await openCreateForm(page);
        await field(page, t.titleField.label).fill(TITLE);
        await saveDraft(page).click();
        await expect(
          page.getByRole('alert').filter({ hasText: draftLimitReason }),
        ).toBeVisible();
        await expect(field(page, t.titleField.label)).toHaveValue(TITLE);
        await form(page, info, 'draft-limit-conflict', theme, { png: false });
      });
    });

    test('a save and a publish in flight lock the form and keep the button width', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      await freezeGalleryClock(page);
      let release = () => {};
      let gate = Promise.resolve();
      await page.route(CREATE_URL, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await gate;
        return route.fulfill(await problemFulfill(500, 'INTERNAL'));
      });
      const hold = () => {
        gate = new Promise<void>((resolve) => (release = resolve));
      };
      await forEachTheme(page, async (theme) => {
        await openCreateForm(page);
        await choosePosition(page);
        hold();
        await saveDraft(page).click();
        await expect(saveDraft(page)).toHaveAttribute('aria-busy', 'true');
        await form(page, info, 'pending-draft', theme, { png: false });
        release();
        const failed = page
          .locator('[data-slot="toast"]')
          .filter({ hasText: t.toast.failed });
        await expect(failed).toBeVisible();
        await failed
          .getByRole('button', { name: messages.common.close, exact: true })
          .click();
        await expect(failed).toHaveCount(0);
        await expect(saveDraft(page)).not.toHaveAttribute('aria-busy', 'true');
        await field(page, t.headcount.label).fill('3');
        await field(page, t.location.label).fill('Київ, віддалено по Україні');
        hold();
        await publish(page).click();
        await expect(publish(page)).toHaveAttribute('aria-busy', 'true');
        await form(page, info, 'pending-create', theme, keep({}));
        release();
        await expect(publish(page)).not.toHaveAttribute('aria-busy', 'true');
      });
    });

    test('the form while it loads', async ({ page }, info) => {
      test.setTimeout(180_000);
      await freezeGalleryClock(page);
      await forEachTheme(page, async (theme) => {
        const prefetched = page.waitForResponse(
          (response) =>
            response.url().includes('/vacancies/new') &&
            Boolean(response.request().headers()['next-router-prefetch']),
        );
        await openHydrated(page, '/vacancies');
        await prefetched;
        const release = await holdNavigation(page, /^\/vacancies\/new$/);
        try {
          await page
            .locator('a[href="/vacancies/new"]')
            .filter({ visible: true })
            .first()
            .click();
          await expect(page).toHaveURL(/\/vacancies\/new$/);
          await expect(
            page.getByRole('heading', { level: 1, name: t.title, exact: true }),
          ).toBeVisible();
          await expect(field(page, t.titleField.label)).toHaveCount(0);
          await form(page, info, 'loading', theme, keep({}));
        } finally {
          release();
        }
        await expect(field(page, t.titleField.label)).toBeVisible();
      });
    });

    test('leaving a dirty form asks first', async ({ page }, info) => {
      test.setTimeout(120_000);
      await freezeGalleryClock(page);
      await forEachTheme(page, async (theme) => {
        await openCreateForm(page);
        await field(page, t.titleField.label).fill(TITLE);
        await page.getByRole('link', { name: t.actions.leave }).click();
        await expect(
          page
            .getByRole('alertdialog')
            .getByText(messages.common.leaveTitle, { exact: true }),
        ).toBeVisible();
        await form(
          page,
          info,
          'leave-guard',
          theme,
          keep({ mobile: true, dark: true }),
        );
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: messages.common.leaveStay, exact: true })
          .click();
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
