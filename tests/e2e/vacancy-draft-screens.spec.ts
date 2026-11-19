import { expect, test, type APIRequestContext } from '@playwright/test';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { DEMO_VERTICALS } from '../../server/db/seed';
import messages from '../../messages/uk.json' with { type: 'json' };
import { E2E_ORIGIN, sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { checkAccessibility } from '../support/accessibility';
import { problemFulfill } from '../support/problem';
import { demoVacancy } from '../support/vacancy-demo';
import { forEachTheme, installFixedClock } from './screens';
import { saveEdit, te, publishEdit, editPath } from './support/vacancy-edit';
import { t, field, notFound, position } from './support/vacancy-create';
import {
  cardMenuButton,
  editPrefetched,
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
import {
  AUTHORS,
  TITLE,
  createGalleryDraft,
  holdNavigation,
  openMenu,
  PHONE_320,
  ZOOM_200,
  previewActionsReady,
  prepare,
  removeGalleryDrafts,
  shoot,
} from './support/vacancy-gallery';

const LIST_OF = (id: string) =>
  `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}&vacancy=${id}`;
const LONG_TITLE =
  'Медіабаєр-арбітражник-наставник-крос-платформений-спеціаліст-закупівлі-трафіку — міжнародна команда, розвиток рекламних напрямів Facebook та партнерських мереж. '
    .repeat(2)
    .slice(0, 200);
const MISSING_ID = '5f3c9a1e-8d2b-4e6f-9a7c-1b2d3e4f5a6b';
const draftsOf = messages.vacancies;

/** The new states are shot for the Recruiter only: the other authors see the same UI. */
const keep = (role: string, png: { mobile?: boolean; dark?: boolean }) => ({
  png: role === 'recruiter' ? png : (false as const),
});

for (const { user, role } of AUTHORS) {
  test.describe(`draft gallery ${role} [SHOT-01..03, D92, D112, D113]`, () => {
    test.use({ storageState: sessionFile(user) });
    test.describe.configure({ mode: 'serial' });
    let api: APIRequestContext;
    let draft: VacancyDetail;
    let incomplete: VacancyDetail;
    test.beforeAll(async ({ playwright }) => {
      api = await playwright.request.newContext({
        baseURL: E2E_ORIGIN,
        storageState: sessionFile(user),
      });
      draft = await createGalleryDraft(api, TITLE);
      incomplete = await createGalleryDraft(api, 'без посади', {
        withPosition: false,
      });
    });
    test.afterEach(({ page }) => removeStubs(page));
    test.afterAll(async () => {
      await removeGalleryDrafts(api, [incomplete, draft]);
    });

    test('own draft list, row menu, card and edit states', async ({
      page,
      isMobile,
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
        if (!isMobile) await previewActionsReady(page);
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
        await shoot(page, info, role, 'edit-stale', theme, {
          deviceViewport: true,
        });
      });
    });

    test('a 200-character title in the list row and the preview', async ({
      page,
      isMobile,
    }, info) => {
      test.setTimeout(120_000);
      await prepare(page, draft, { title: LONG_TITLE });
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, LIST_OF(draft.id));
        await expect(menuButton(page, LONG_TITLE)).toBeVisible();
        if (!isMobile) await previewActionsReady(page);
        await shoot(page, info, role, 'draft-list-long-title', theme, {
          png: false,
        });
      });
    });

    test('an incomplete draft: the row, the menu and the card explain the disabled publish', async ({
      page,
      isMobile,
    }, info) => {
      test.setTimeout(180_000);
      await prepare(page, incomplete);
      const reason = draftsOf.draftErrors.positionRequired;
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, LIST_OF(incomplete.id));
        await expect(menuButton(page, TITLE)).toBeVisible();
        await expect(
          page
            .getByText(draftsOf.draft.noPosition)
            .filter({ visible: true })
            .first(),
        ).toBeVisible();
        if (!isMobile) await previewActionsReady(page);
        await shoot(page, info, role, 'incomplete-draft-list', theme, {
          png: false,
        });
        await openMenu(menuButton(page, TITLE), menuItem(page, ta.publish));
        await expect(menuItem(page, ta.publish)).toContainText(reason);
        await shoot(
          page,
          info,
          role,
          'incomplete-draft-menu',
          theme,
          keep(role, { mobile: true }),
        );
        await page.keyboard.press('Escape');
        await openHydrated(page, `/vacancies/${incomplete.id}`);
        const publishButton = page.getByRole('button', {
          name: ta.publish,
          exact: true,
        });
        await expect(publishButton).toHaveAttribute('aria-disabled', 'true');
        if (isMobile) {
          await expect(page.getByText(reason, { exact: true })).toBeVisible();
          await shoot(
            page,
            info,
            role,
            'incomplete-draft-card',
            theme,
            keep(role, { mobile: true }),
          );
        } else {
          await checkAccessibility(page, info);
          await publishButton.hover();
          await expect(
            page
              .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
              .filter({ hasText: reason }),
          ).toBeVisible();
          await shoot(page, info, role, 'incomplete-draft-card', theme, {
            deviceViewport: true,
            keepFocus: true,
            scan: false,
            png: keep(role, {}).png,
          });
        }
      });
    });

    test('«Чернетки 0»: the empty own-draft list', async ({ page }, info) => {
      test.setTimeout(120_000);
      await installFixedClock(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
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
        await openHydrated(
          page,
          `/vacancies?status=DRAFT&vertical=${DEMO_VERTICALS.gambling}`,
        );
        await expect(
          page.getByText(draftsOf.draft.empty.title, { exact: true }),
        ).toBeVisible();
        await shoot(
          page,
          info,
          role,
          'drafts-empty',
          theme,
          keep(role, { mobile: true }),
        );
      });
    });

    test('the edit page while it loads', async ({ page }, info) => {
      test.setTimeout(180_000);
      await prepare(page, draft);
      await forEachTheme(page, async (theme) => {
        const prefetched = editPrefetched(page, draft.id);
        await openHydrated(page, `/vacancies/${draft.id}`);
        await prefetched;
        const release = await holdNavigation(
          page,
          new RegExp(`^/vacancies/${draft.id}/edit$`),
        );
        try {
          await page
            .getByRole('link', { name: ta.edit, exact: true })
            .filter({ visible: true })
            .click();
          await expect(page).toHaveURL(
            new RegExp(`/vacancies/${draft.id}/edit$`),
          );
          await expect(
            page.getByRole('heading', {
              level: 1,
              name: te.title,
              exact: true,
            }),
          ).toBeVisible();
          await expect(field(page, t.titleField.label)).toHaveCount(0);
          await shoot(page, info, role, 'edit-loading', theme, keep(role, {}));
        } finally {
          release();
        }
        await expect(field(page, t.titleField.label)).toHaveValue(TITLE);
      });
    });

    test('the edit page of a published vacancy and of a missing one', async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      await installFixedClock(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await forEachTheme(page, async (theme) => {
        await page.goto(editPath(demoVacancy(1).id));
        await expect(
          page
            .getByRole('alert')
            .filter({ hasText: draftsOf.draftErrors.notDraft }),
        ).toBeVisible();
        await expect(saveEdit(page)).toHaveCount(0);
        await shoot(page, info, role, 'edit-not-draft', theme, keep(role, {}));
        const missing = await page.goto(editPath(MISSING_ID));
        expect(missing?.status()).toBe(404);
        await expect(notFound(page)).toBeVisible();
        await shoot(page, info, role, 'edit-not-found', theme, { png: false });
      });
    });

    test('a publish refused for an inactive position flags the field', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      await prepare(page, draft);
      await page.route(
        new RegExp(`/api/v1/vacancies/${draft.id}/publish$`),
        async (route) =>
          route.fulfill(await problemFulfill(409, 'POSITION_INACTIVE')),
      );
      await forEachTheme(page, async (theme) => {
        await openHydrated(page, editPath(draft.id));
        await expect(field(page, t.titleField.label)).toHaveValue(TITLE);
        await publishEdit(page).click();
        await expect(
          page.getByText(draftsOf.draftErrors.positionInactive, {
            exact: true,
          }),
        ).toBeVisible();
        const refusal = page
          .locator('[data-slot="toast"]')
          .filter({ hasText: te.toast.refused });
        await expect(refusal).toBeVisible();
        await refusal
          .getByRole('button', { name: te.toast.showFields })
          .click();
        await expect(position(page)).toBeFocused();
        await expect(refusal).toHaveCount(0);
        await shoot(page, info, role, 'publish-refused', theme, {
          deviceViewport: true,
          ...keep(role, { mobile: true }),
        });
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
        const title = LONG_TITLE;
        const fixed = await prepare(page, draft, { title });
        await forEachTheme(page, async (theme) => {
          fixed.status = 'DRAFT';
          delete fixed.cancelReason;
          await openHydrated(page, `/vacancies/${draft.id}`);
          await cardMenuButton(page, title).click();
          await menuItem(page, ta.cancel).click();
          await expect(cancelDialog(page)).toContainText(title);
          await shoot(page, info, role, 'cancel-long-title', theme);
          // 320 px and 200% zoom: the description is clamped and both buttons stay on screen without scrolling the sheet.
          const original = page.viewportSize()!;
          const narrow = isMobile ? PHONE_320 : ZOOM_200;
          await page.setViewportSize(narrow);
          const dialog = cancelDialog(page);
          await reasonBox(page).fill('a'.repeat(450));
          for (const name of [tc.cancel.keep, tc.cancel.confirm]) {
            const box = await dialog
              .getByRole('button', { name })
              .boundingBox();
            expect(box, name).not.toBeNull();
            expect(box!.y + box!.height, name).toBeLessThanOrEqual(
              narrow.height,
            );
            expect(box!.x + box!.width, name).toBeLessThanOrEqual(narrow.width);
          }
          await shoot(
            page,
            info,
            role,
            `cancel-long-title-${isMobile ? '320' : 'zoom200'}`,
            theme,
            { deviceViewport: true, ...(isMobile ? {} : { png: false }) },
          );
          await page.setViewportSize(original);
          await reasonBox(page).fill('');
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
