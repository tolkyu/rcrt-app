import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { DEMO_VERTICALS } from '../../server/db/seed';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { demoVacancy } from '../support/vacancy-demo';
import { forEachTheme } from './screens';
import {
  CREATE_URL,
  choosePosition,
  field,
  publish,
  saveDraft,
  t,
} from './support/vacancy-create';
import {
  cardMenuButton,
  menuButton,
  menuItem,
  removeStubs,
  ta,
} from './support/vacancy-draft-actions';
import {
  confirmCancel,
  confirmDelete,
  deleteDialog,
  reasonBox,
} from './support/vacancy-close';
import {
  AUTHORS,
  TITLE,
  createGalleryDraft,
  openCreateForm,
  openMenu,
  prepare,
  previewActionsReady,
  removeGalleryDrafts,
  shoot,
} from './support/vacancy-gallery';

const toast = (page: Page, title: string) =>
  page.locator('[data-slot="toast"]').filter({ hasText: title });
const closeToast = async (page: Page, item: Locator) => {
  await item
    .getByRole('button', { name: messages.common.close, exact: true })
    .click();
  await expect(item).toHaveCount(0);
};
const REASON = 'Команда змінила плани найму.';
const LIST_OF = (id: string) =>
  `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}&vacancy=${id}`;

for (const { user, role } of AUTHORS.filter(
  ({ role }) => role === 'recruiter',
)) {
  test.describe(`result toasts ${role} [SHOT-01..03, D98, D113]`, () => {
    test.use({ storageState: sessionFile(user) });
    test.describe.configure({ mode: 'serial' });
    let api: APIRequestContext;
    let draft: VacancyDetail;
    test.beforeAll(async ({ playwright }) => {
      api = await playwright.request.newContext({
        baseURL: E2E_ORIGIN,
        storageState: sessionFile(user),
      });
      draft = await createGalleryDraft(api, TITLE);
    });
    test.afterEach(({ page }) => removeStubs(page));
    test.afterAll(() => removeGalleryDrafts(api, [draft]));

    /** The list, the count and the card follow `state`, so a stubbed write leaves the screen consistent with its toast. */
    async function follow(page: Page, fixed: VacancyDetail) {
      const state = { gone: false, current: fixed };
      await page.route(
        (url) => url.pathname === '/api/v1/vacancies',
        (route) =>
          route.request().method() === 'GET'
            ? route.fulfill({
                json: {
                  items: state.gone ? [] : [state.current],
                  nextCursor: null,
                  prevCursor: null,
                },
              })
            : route.fallback(),
      );
      await page.route(`**/api/v1/vacancies/${draft.id}`, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ json: state.current })
          : route.fallback(),
      );
      return state;
    }

    test('«Чернетку збережено» and «Вакансію створено»', async ({
      page,
      isMobile,
    }, info) => {
      test.setTimeout(180_000);
      const fixed = await prepare(page, draft);
      await follow(page, fixed);
      // A real published vacancy answers the publish, so the card the page lands on agrees with the toast.
      const published = (await (
        await page.request.get(`/api/v1/vacancies/${demoVacancy(1).id}`)
      ).json()) as VacancyDetail;
      await page.route(CREATE_URL, (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const mode = (route.request().postDataJSON() as { mode: string }).mode;
        return route.fulfill({
          status: 201,
          json: mode === 'PUBLISH' ? published : fixed,
        });
      });
      await forEachTheme(page, async (theme) => {
        await openCreateForm(page);
        await field(page, t.titleField.label).fill(TITLE);
        await saveDraft(page).click();
        await expect(toast(page, t.toast.draftSaved)).toBeVisible();
        if (!isMobile) await previewActionsReady(page);
        await shoot(page, info, role, 'toast-draft-saved', theme, {
          deviceViewport: true,
          png: false,
        });
        await openCreateForm(page);
        await choosePosition(page);
        await field(page, t.headcount.label).fill('3');
        await field(page, t.location.label).fill('Київ, віддалено по Україні');
        await publish(page).click();
        await expect(toast(page, t.toast.created)).toBeVisible();
        await expect(
          page.getByRole('heading', { level: 1, name: published.title }),
        ).toBeVisible();
        await shoot(page, info, role, 'toast-created', theme, {
          deviceViewport: true,
          png: false,
        });
      });
    });

    test('«Вакансію опубліковано» with its «Відкрити» action', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const fixed = await prepare(page, draft);
      const state = await follow(page, fixed);
      await page.route(
        new RegExp(`/api/v1/vacancies/${draft.id}/publish$`),
        (route) => {
          state.current = {
            ...fixed,
            status: 'OPEN',
            openedAt: FIXED_CLOCK_ISO,
            version: fixed.version + 1,
          };
          state.gone = true;
          return route.fulfill({ json: state.current });
        },
      );
      await forEachTheme(page, async (theme) => {
        state.gone = false;
        state.current = fixed;
        await openHydrated(page, LIST_OF(draft.id));
        await openMenu(menuButton(page, TITLE), menuItem(page, ta.publish));
        await menuItem(page, ta.publish).click();
        await expect(toast(page, ta.toast.published)).toBeVisible();
        await shoot(page, info, role, 'toast-published', theme, {
          deviceViewport: true,
          png: { mobile: true },
        });
      });
    });

    test('«Вакансію скасовано» and «Чернетку видалено»', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const fixed = await prepare(page, draft);
      const state = await follow(page, fixed);
      await page.route(
        new RegExp(`/api/v1/vacancies/${draft.id}/cancel$`),
        (route) => {
          state.current = {
            ...fixed,
            status: 'CANCELLED',
            cancelReason: REASON,
          };
          return route.fulfill({ json: state.current });
        },
      );
      await page.route(`**/api/v1/vacancies/${draft.id}`, (route) => {
        if (route.request().method() !== 'DELETE') return route.fallback();
        state.gone = true;
        return route.fulfill({ json: { id: draft.id } });
      });
      await forEachTheme(page, async (theme) => {
        state.gone = false;
        state.current = fixed;
        await openHydrated(page, `/vacancies/${draft.id}`);
        await openMenu(cardMenuButton(page, TITLE), menuItem(page, ta.cancel));
        await menuItem(page, ta.cancel).click();
        await reasonBox(page).fill(REASON);
        await confirmCancel(page).click();
        const cancelled = toast(
          page,
          messages.vacancies.draft.close.toast.cancelled,
        );
        await expect(cancelled).toBeVisible();
        await shoot(page, info, role, 'toast-cancelled', theme, {
          deviceViewport: true,
          png: false,
        });
        await closeToast(page, cancelled);
        await page
          .getByRole('button', { name: ta.delete, exact: true })
          .click();
        await expect(deleteDialog(page, true)).toBeVisible();
        await confirmDelete(page).click();
        await expect(
          toast(page, messages.vacancies.draft.close.toast.deletedCancelled),
        ).toBeVisible();
        await shoot(page, info, role, 'toast-deleted', theme, {
          deviceViewport: true,
          png: false,
        });
      });
    });
  });
}
