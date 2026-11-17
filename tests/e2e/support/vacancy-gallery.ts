import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../../lib/fixed-clock';
import type { VacancyDetail } from '../../../lib/schemas/vacancy';
import { DEMO_VERTICALS } from '../../../server/db/seed';
import { checkAccessibility } from '../../support/accessibility';
import messages from '../../../messages/uk.json' with { type: 'json' };
import { openHydrated } from '../../support/hydration';
import { chooseOption } from '../../support/select';
import { captureScreen, installFixedClock, viewportOf } from '../screens';
import { ta } from './vacancy-draft-actions';
import { activePositionId, write } from './vacancy-edit';
import { OWN_DRAFT_PREFIX, field, t, vertical } from './vacancy-create';

export const TITLE = 'Медіабаєр — Facebook, міжнародна команда';
export const AUTHORS = [
  { user: 'admin@demo', role: 'admin' },
  { user: 'head.recruiter.gambling@demo', role: 'head-recruiter' },
  { user: 'recruiter1.gambling@demo', role: 'recruiter' },
] as const;

export const PHONE_320 = { width: 320, height: 568 };
/** 200% browser zoom on a 1440 px screen leaves a 720 px layout viewport. */
export const ZOOM_200 = { width: 720, height: 450 };

/** Prefetched lists stay fresh for a minute by the browser clock, which the fixed clock holds before the server's time: one jump ages every cache. */
export const ageCaches = (page: Page) =>
  page.clock.fastForward(Date.now() - Date.parse(FIXED_CLOCK_ISO) + 61_000);

/** Holds the client navigation to a page until released; the loading boundary prefetched earlier stays on screen meanwhile. */
export async function holdNavigation(page: Page, path: RegExp) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => path.test(url.pathname),
    async (route) => {
      const headers = await route.request().allHeaders();
      if (headers['rsc'] && !headers['next-router-prefetch']) await gate;
      await route.fallback();
    },
  );
  return release;
}

export async function freezeGalleryClock(page: Page) {
  await installFixedClock(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

/** The create form with a vertical chosen, whoever opens it. */
export async function openCreateForm(page: Page) {
  await openHydrated(page, '/vacancies/new');
  await expect(field(page, t.titleField.label)).toBeVisible();
  if (await vertical(page).isEnabled())
    await chooseOption(page, vertical(page), 'Гемблінг');
}

/** The preview's only focusable content is the lazily loaded action row; a scan before it arrives sees a scrollable region with nothing to focus. */
export const previewActionsReady = (page: Page) =>
  expect(
    page
      .getByRole('complementary', { name: messages.vacancies.previewLabel })
      .getByRole('link', { name: ta.edit, exact: true }),
  ).toBeVisible();

/** Worst-case evidence without a PNG: nothing scrolls sideways and every footer action sits inside the viewport. */
export async function expectFitsViewport(page: Page, state: string) {
  const fits = await page.evaluate(() => {
    const width = window.innerWidth;
    const footer = Array.from(
      document.querySelectorAll('[data-slot="form-page-footer"] > *'),
    );
    return {
      page: document.documentElement.scrollWidth <= width,
      footer: footer.every((item) => {
        const box = item.getBoundingClientRect();
        return box.left >= 0 && box.right <= width;
      }),
    };
  });
  expect(fits, state).toEqual({ page: true, footer: true });
}

/** The menu code loads on first hover or focus: a press that lands before it arrives opens nothing, so the press is repeated until the item shows. */
export const openMenu = (button: Locator, item: Locator) =>
  expect(async () => {
    if (!(await item.isVisible())) await button.click();
    await expect(item).toBeVisible({ timeout: 1_500 });
  }).toPass();

export interface Capture {
  /** Keep the real screen height: toasts and pinned bars are judged against it. */
  deviceViewport?: boolean;
  /** Keep hover and focus: a tooltip exists only while its trigger has them. */
  keepFocus?: boolean;
  /** Skip the scan when the caller has already scanned the state without the transient layer that cannot pass (BUG-S3-20). */
  scan?: boolean;
  /**
   * Which PNGs a new state gets: unset = every viewport and theme (the older gallery states); `false` = none, the scan and
   * the assertions around the call are the evidence; an object = desktop light, plus mobile and/or dark when named.
   */
  png?: false | { mobile?: boolean; dark?: boolean };
}

const wanted = (png: Capture['png'], info: TestInfo, theme: string) =>
  png === undefined ||
  (png !== false &&
    (theme === 'light' || png.dark === true) &&
    (viewportOf(info) === 'desktop' || png.mobile === true));

/** An open menu is scanned with `main` only: the page behind it is inert. */
async function scanState(page: Page, info: TestInfo) {
  if (!(await page.getByRole('menu').count()))
    return checkAccessibility(page, info);
  const result = await new AxeBuilder({ page })
    .include('[role="menu"]')
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

/** `41-<role>-vacancy-form-<state>-<viewport>-<theme>.png`, taken after the accessibility scan. */
export async function shoot(
  page: Page,
  info: TestInfo,
  role: string,
  state: string,
  theme: string,
  { scan = true, png, ...capture }: Capture = {},
  prefix: '40' | '41' = '41',
) {
  if (scan) await scanState(page, info);
  if (!wanted(png, info, theme)) return;
  await captureScreen(
    page,
    info,
    `${prefix}-${role}-vacancy-form-${state}-${viewportOf(info)}-${theme}.png`,
    'phase-2',
    capture,
  );
}

export async function createGalleryDraft(
  api: APIRequestContext,
  label: string,
  { withPosition = true } = {},
) {
  const response = await api.post('/api/v1/vacancies', {
    headers: write(),
    data: {
      mode: 'DRAFT',
      verticalId: DEMO_VERTICALS.gambling,
      ...(withPosition ? { positionId: await activePositionId(api) } : {}),
      title: `${OWN_DRAFT_PREFIX} ${label}`,
      priority: 'URGENT',
      headcount: 3,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as VacancyDetail;
}

export async function removeGalleryDrafts(
  api: APIRequestContext | undefined,
  drafts: readonly (VacancyDetail | undefined)[],
) {
  for (const draft of drafts) {
    if (!api || !draft) continue;
    const response = await api.delete(`/api/v1/vacancies/${draft.id}`, {
      headers: write(),
      data: {},
    });
    expect([200, 404], await response.text()).toContain(response.status());
  }
  await api?.dispose();
}

const kyivDate = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** Dates the server formats into its own HTML (the edit page's loading heading), which the ISO replacement cannot reach. */
const kyiv = (iso: string) => kyivDate.format(new Date(iso));

/** The draft as the gallery shows it: a stable number, title and dates whatever the database holds. */
export const fixedDraft = (
  draft: VacancyDetail,
  overrides: Partial<VacancyDetail> = {},
): VacancyDetail => ({
  ...draft,
  title: TITLE,
  number: 'V-0501',
  createdAt: FIXED_CLOCK_ISO,
  updatedAt: FIXED_CLOCK_ISO,
  ...overrides,
});

/** Real route access, deterministic visible fixture: writes remain refused by each scenario's browser stub. */
export async function prepare(
  page: Page,
  draft: VacancyDetail,
  overrides: Partial<VacancyDetail> = {},
) {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixed = fixedDraft(draft, overrides);
  await page.route(
    (url) => url.pathname.startsWith('/vacancies'),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replaceAll(draft.title, fixed.title)
        .replaceAll(draft.number, fixed.number)
        .replaceAll(draft.createdAt, fixed.createdAt)
        .replaceAll(draft.updatedAt, fixed.updatedAt)
        .replaceAll(kyiv(draft.updatedAt), kyiv(fixed.updatedAt))
        .replace(/(isInvalidated\\?":)false/g, '$1true');
      await route.fulfill({ response, body });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/v1/vacancies',
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            json: { items: [fixed], nextCursor: null, prevCursor: null },
          })
        : route.fallback(),
  );
  await page.route('**/api/v1/vacancies/drafts/count', (route) =>
    route.fulfill({ json: { count: 1 } }),
  );
  await page.route(`**/api/v1/vacancies/${draft.id}`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: fixed })
      : route.fallback(),
  );
  return fixed;
}
