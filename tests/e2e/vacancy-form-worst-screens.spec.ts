import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { DEMO_VERTICALS } from '../../server/db/seed';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import { chooseOption } from '../support/select';
import { forEachTheme, viewportOf } from './screens';
import {
  t,
  field,
  vertical,
  position,
  publish,
  saveDraft,
  teamLead,
  LEADS,
  draftLimitReason,
  CREATE_URL,
} from './support/vacancy-create';
import {
  PHONE_320,
  TITLE,
  ZOOM_200,
  expectFitsViewport,
  freezeGalleryClock,
  openCreateForm,
  shoot,
} from './support/vacancy-gallery';

const POSITIONS_URL = /\/api\/v1\/positions\?/;
const TEAM_LEADS_URL = /\/verticals\/[^/]+\/team-leads$/;
const form = async (
  page: Page,
  info: TestInfo,
  state: string,
  theme: string,
) => {
  await shoot(page, info, 'admin', state, theme, { png: false }, '40');
  await expectFitsViewport(page, state);
};

test.describe('vacancy form worst cases, Admin [SHOT-01..03, ux §10]', () => {
  test.use({ storageState: sessionFile('admin@demo') });

  const LONG_POSITION =
    'Старший медіабаєр-арбітражник у напрямку Facebook і TikTok'
      .padEnd(80, ' Ads')
      .slice(0, 80);
  test('worst case: a 200-character title, an 80-character position and two Team Leads of one name', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await freezeGalleryClock(page);
    const positionId = '7b1f6c2e-4a3d-4e5f-8a9b-0c1d2e3f4a5b';
    await page.route(POSITIONS_URL, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: positionId,
              verticalId: DEMO_VERTICALS.gambling,
              name: LONG_POSITION,
              isActive: true,
              version: 1,
              createdAt: FIXED_CLOCK_ISO,
              openVacanciesCount: null,
            },
          ],
        },
      }),
    );
    await page.route(TEAM_LEADS_URL, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: '2e6b0c7a-1d3f-4a5b-9c8d-7e6f5a4b3c2d',
              fullName: LEADS.vasyl,
              priority: 0,
            },
            {
              id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
              fullName: LEADS.vasyl,
              priority: 1,
            },
          ],
        },
      }),
    );
    await forEachTheme(page, async (theme) => {
      await openCreateForm(page);
      await position(page).click();
      await expect(
        page.getByRole('option', { name: LONG_POSITION }),
      ).toBeVisible();
      await form(page, info, 'worst-position-open', theme);
      await page.getByRole('option', { name: LONG_POSITION }).click();
      await field(page, t.titleField.label).fill('Т'.repeat(200));
      await teamLead(page).click();
      await expect(
        page.getByRole('option', { name: new RegExp(`^${LEADS.vasyl}`) }),
      ).toHaveCount(2);
      await form(page, info, 'worst-team-leads', theme);
      await page.keyboard.press('Escape');
      await form(page, info, 'worst-title-200', theme);
    });
  });

  test('worst case at 320 px and 200% zoom: the error summary, the limit alert and the leave guard', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await freezeGalleryClock(page);
    const original = page.viewportSize()!;
    const phone = viewportOf(info) === 'mobile';
    const suffix = phone ? '320' : 'zoom200';
    await page.setViewportSize(phone ? PHONE_320 : ZOOM_200);
    try {
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, '/vacancies/new');
        await publish(page).click();
        await expect(page.locator('[data-slot="form-error"]')).toBeVisible();
        await form(page, info, `publish-errors-${suffix}`, theme);
        await page.route(CREATE_URL, async (route) =>
          route.request().method() === 'POST'
            ? route.fulfill(await problemFulfill(409, 'DRAFT_LIMIT_REACHED'))
            : route.fallback(),
        );
        await chooseOption(page, vertical(page), 'Гемблінг');
        await field(page, t.titleField.label).fill(TITLE);
        await saveDraft(page).click();
        await expect(
          page.getByRole('alert').filter({ hasText: draftLimitReason }),
        ).toBeVisible();
        await form(page, info, `draft-limit-conflict-${suffix}`, theme);
        await page.unroute(CREATE_URL);
        await page.getByRole('link', { name: t.actions.leave }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await form(page, info, `leave-guard-${suffix}`, theme);
      });
    } finally {
      await page.setViewportSize(original);
    }
  });
});
