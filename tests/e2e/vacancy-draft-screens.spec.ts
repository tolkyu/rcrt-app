import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { DEMO_VERTICALS } from '../../server/db/seed';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { checkAccessibility } from '../support/accessibility';
import { problemFulfill } from '../support/problem';
import { captureScreen, forEachTheme, viewportOf } from './screens';
import { activePositionId, write, saveEdit, te } from './support/vacancy-edit';
import { t, field, OWN_DRAFT_PREFIX } from './support/vacancy-create';
import {
  cardMenuButton,
  menuButton,
  menuItem,
  ta,
  removeStubs,
} from './support/vacancy-draft-actions';
import {
  cancelDialog,
  deleteDialog,
  reasonBox,
  confirmCancel,
  tc,
} from './support/vacancy-close';

const TITLE = 'Медіабаєр — Facebook, міжнародна команда';
const AUTHORS = [
  { user: 'admin@demo', role: 'admin' },
  { user: 'head.recruiter.gambling@demo', role: 'head-recruiter' },
  { user: 'recruiter1.gambling@demo', role: 'recruiter' },
] as const;

async function shoot(
  page: Page,
  info: TestInfo,
  role: string,
  state: string,
  theme: string,
  realViewport = false,
) {
  if (await page.getByRole('menu').count()) {
    const result = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  } else await checkAccessibility(page, info);
  await captureScreen(
    page,
    info,
    `41-${role}-vacancy-form-${state}-${viewportOf(info)}-${theme}.png`,
    'phase-2',
    // Toasts and small-screen states are judged at the real screen height, not at a page-tall viewport.
    { deviceViewport: realViewport },
  );
}

/** Real route access, deterministic visible fixture: writes remain refused by each scenario's browser stub. */
async function prepare(
  page: Page,
  draft: VacancyDetail,
  overrides: Partial<Pick<VacancyDetail, 'title' | 'status'>> = {},
) {
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixed = {
    ...draft,
    title: TITLE,
    number: 'V-0501',
    createdAt: FIXED_CLOCK_ISO,
    updatedAt: FIXED_CLOCK_ISO,
    ...overrides,
  };
  await page.route(
    (url) => url.pathname.startsWith('/vacancies'),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replaceAll(draft.title, fixed.title)
        .replaceAll(draft.number, fixed.number)
        .replaceAll(draft.createdAt, fixed.createdAt)
        .replaceAll(draft.updatedAt, fixed.updatedAt)
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

for (const { user, role } of AUTHORS) {
  test.describe(`draft gallery ${role} [SHOT-01..03, D92, D112, D113]`, () => {
    test.use({ storageState: sessionFile(user) });
    test.describe.configure({ mode: 'serial' });
    let api: APIRequestContext;
    let draft: VacancyDetail;
    test.beforeAll(async ({ playwright }) => {
      api = await playwright.request.newContext({
        baseURL: E2E_ORIGIN,
        storageState: sessionFile(user),
      });
      const response = await api.post('/api/v1/vacancies', {
        headers: write(),
        data: {
          mode: 'DRAFT',
          verticalId: DEMO_VERTICALS.gambling,
          positionId: await activePositionId(api),
          title: `${OWN_DRAFT_PREFIX} ${TITLE}`,
          priority: 'URGENT',
          headcount: 3,
        },
      });
      expect(response.status(), await response.text()).toBe(201);
      draft = (await response.json()) as VacancyDetail;
    });
    test.afterEach(({ page }) => removeStubs(page));
    test.afterAll(async () => {
      if (draft) {
        const response = await api.delete(`/api/v1/vacancies/${draft.id}`, {
          headers: write(),
          data: {},
        });
        expect([200, 404], await response.text()).toContain(response.status());
      }
      await api?.dispose();
    });

    test('own draft list, row menu, card and edit states', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      await prepare(page, draft);
      await forEachTheme(page, async (theme) => {
        await openHydrated(
          page,
          `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}&vacancy=${draft.id}`,
        );
        await expect(menuButton(page, TITLE)).toHaveCount(1);
        await expect(menuButton(page, TITLE)).toBeVisible();
        await shoot(page, info, role, 'draft-list', theme);
        await menuButton(page, TITLE).click();
        await expect(menuItem(page, ta.cancel)).toBeVisible();
        await shoot(page, info, role, 'draft-menu', theme);
        await page.keyboard.press('Escape');
        await openHydrated(page, `/vacancies/${draft.id}`);
        await expect(cardMenuButton(page, TITLE)).toBeVisible();
        await shoot(page, info, role, 'draft-card', theme);
        await openHydrated(page, `/vacancies/${draft.id}/edit`);
        await expect(field(page, t.titleField.label)).toHaveValue(TITLE);
        await shoot(page, info, role, 'edit-loaded', theme);
        await field(page, t.titleField.label).fill(`${TITLE} — Київ`);
        await page.route(`**/api/v1/vacancies/${draft.id}`, async (route) =>
          route.request().method() === 'PATCH'
            ? route.fulfill(await problemFulfill(409, 'STALE_STATE'))
            : route.fallback(),
        );
        await saveEdit(page).click();
        await expect(
          page
            .getByRole('alert')
            .filter({ hasText: te.toast.staleDescription }),
        ).toBeVisible();
        await shoot(page, info, role, 'edit-stale', theme, true);
      });
    });

    if (role === 'recruiter')
      test('cancel and delete dialog states', async ({ page }, info) => {
        test.setTimeout(180_000);
        await prepare(page, draft);
        await forEachTheme(page, async (theme) => {
          await openHydrated(page, `/vacancies/${draft.id}`);
          await cardMenuButton(page, TITLE).click();
          await menuItem(page, ta.cancel).click();
          await expect(cancelDialog(page)).toBeVisible();
          await shoot(page, info, role, 'cancel-empty', theme);
          await reasonBox(page).fill(
            'Команда змінила плани найму.\nПовернемось до пошуку наступного кварталу.',
          );
          await shoot(page, info, role, 'cancel-filled', theme);
          const prefix = 'Причина перегляду планів:\n\n';
          await reasonBox(page).fill(
            prefix +
              'Перенесено найм до затвердження бюджету. '
                .repeat(20)
                .slice(0, 500 - prefix.length),
          );
          await shoot(page, info, role, 'cancel-max-reason', theme);
          await page.route(
            `**/api/v1/vacancies/${draft.id}/cancel`,
            async (route) =>
              route.fulfill(await problemFulfill(409, 'STALE_STATE')),
          );
          await confirmCancel(page).click();
          await expect(
            page.getByText(messages.vacancies.draftErrors.stale, {
              exact: true,
            }),
          ).toBeVisible();
          await shoot(page, info, role, 'cancel-stale', theme);
          await cancelDialog(page)
            .getByRole('button', { name: tc.cancel.keep })
            .click();
          await expect(cancelDialog(page)).toHaveCount(0);
          await cardMenuButton(page, TITLE).click();
          await menuItem(page, ta.delete).click();
          await expect(deleteDialog(page)).toBeVisible();
          await shoot(page, info, role, 'delete-draft', theme);
          await deleteDialog(page)
            .getByRole('button', { name: tc.delete.keep, exact: true })
            .click();
        });
      });

    if (role === 'recruiter')
      test('long title, pending cancel and cancelled draft deletion', async ({
        page,
        isMobile,
      }, info) => {
        test.setTimeout(180_000);
        const title =
          'Медіабаєр-арбітражник-наставник-крос-платформений-спеціаліст-закупівлі-трафіку — міжнародна команда, розвиток рекламних напрямів Facebook та партнерських мереж. '
            .repeat(2)
            .slice(0, 200);
        const fixed = await prepare(page, draft, { title });
        await forEachTheme(page, async (theme) => {
          fixed.status = 'DRAFT';
          delete fixed.cancelReason;
          await openHydrated(page, `/vacancies/${draft.id}`);
          await cardMenuButton(page, title).click();
          await menuItem(page, ta.cancel).click();
          await expect(cancelDialog(page)).toContainText(title);
          await shoot(page, info, role, 'cancel-long-title', theme);
          if (isMobile) {
            // 320 px: the description is clamped and both buttons stay on screen without scrolling the sheet.
            const original = page.viewportSize()!;
            await page.setViewportSize({ width: 320, height: 568 });
            const dialog = cancelDialog(page);
            await reasonBox(page).fill('a'.repeat(450));
            for (const name of [tc.cancel.keep, tc.cancel.confirm]) {
              const box = await dialog
                .getByRole('button', { name })
                .boundingBox();
              expect(box, name).not.toBeNull();
              expect(box!.y + box!.height, name).toBeLessThanOrEqual(568);
              expect(box!.x + box!.width, name).toBeLessThanOrEqual(320);
            }
            await shoot(page, info, role, 'cancel-long-title-320', theme, true);
            await page.setViewportSize(original);
            await reasonBox(page).fill('');
          }
          await reasonBox(page).fill(
            'Найм призупинено до затвердження бюджету.',
          );
          let release = () => {};
          const gate = new Promise<void>((resolve) => (release = resolve));
          await page.route(
            `**/api/v1/vacancies/${draft.id}/cancel`,
            async (route) => {
              await gate;
              await route.fulfill(await problemFulfill(409, 'STALE_STATE'));
            },
          );
          try {
            await confirmCancel(page).click();
            await expect(reasonBox(page)).toHaveAttribute(
              'aria-readonly',
              'true',
            );
            await shoot(page, info, role, 'cancel-pending', theme);
          } finally {
            release();
          }
          await expect(
            page.getByText(messages.vacancies.draftErrors.stale, {
              exact: true,
            }),
          ).toBeVisible();
          await cancelDialog(page)
            .getByRole('button', { name: tc.cancel.keep })
            .click();
          fixed.status = 'CANCELLED';
          fixed.cancelReason = 'Найм призупинено до затвердження бюджету.';
          await openHydrated(page, `/vacancies/${draft.id}`);
          await page
            .getByRole('button', { name: ta.delete, exact: true })
            .click();
          await expect(deleteDialog(page, true)).toBeVisible();
          await shoot(page, info, role, 'delete-cancelled', theme);
          await deleteDialog(page, true)
            .getByRole('button', { name: tc.delete.keep, exact: true })
            .click();
          await expect(deleteDialog(page, true)).toHaveCount(0);
          await shoot(page, info, role, 'cancelled-card', theme);
        });
      });
  });
}
