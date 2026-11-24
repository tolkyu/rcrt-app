import { expect, type Locator, type Page } from '@playwright/test';
import { sessionFile } from '../support/e2e-session';
import { openHydrated } from '../support/hydration';
import { problemFulfill } from '../support/problem';
import {
  contentPath,
  contentUrl,
  editor,
  editorRuntimePath,
  fieldSection,
  openContent,
  RECRUITER,
  replaceText,
  saveContent,
  saved,
  setContentStatus,
  tc,
  test,
  tr,
  type ContentFixture,
} from './support/vacancy-content';

const EDITED = 'Опис після правки';
const MIN_TARGET = 44;
const LARGE_TARGET = 55;

const toolbar = (page: Page) =>
  fieldSection(page, 'description').getByRole('toolbar');
const more = (page: Page) => toolbar(page).locator('[data-toolbar-key="more"]');
const headingOne = (page: Page) =>
  toolbar(page).locator('[data-toolbar-key="heading1"]');
const noChangesHint = (page: Page) =>
  page
    .locator('[data-slot="form-page-footer"]')
    .filter({ visible: true })
    .getByText(tc.saveNoChanges, { exact: true });

const pointOf = async (control: Locator) => {
  await control.scrollIntoViewIfNeeded();
  const box = (await control.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** A real touch at the control's centre: a locked control refuses `tap()`, and a press that lands elsewhere would prove nothing. */
async function touch(page: Page, control: Locator) {
  const { x, y } = await pointOf(control);
  const hit = await control.evaluate(
    (element, point) =>
      element.contains(document.elementFromPoint(point.x, point.y)),
    { x, y },
  );
  expect(hit).toBe(true);
  await page.touchscreen.tap(x, y);
}

const measureTargets = (page: Page) =>
  toolbar(page)
    .locator('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const { width, height } = button.getBoundingClientRect();
        return { width, height };
      }),
    );
/** A tap leaves the Button's press scale (0.97, motion-safe only) on the control in Chromium's touch emulation; layout is measured without it. */
const withoutPressScale = (page: Page) =>
  page.emulateMedia({ reducedMotion: 'reduce' });
const hasPageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
/** The UA default font size, which `rem` media queries read; a CSS `html` font size would not move the breakpoint. */
async function setBrowserDefaultFont(page: Page, size: number) {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: { standard: size, fixed: Math.round((size * 13) / 16) },
  });
}
const firstRowCount = (page: Page) =>
  toolbar(page)
    .locator('button')
    .evaluateAll((buttons) => {
      const tops = buttons.map((button) => button.getBoundingClientRect().top);
      const first = Math.min(...tops);
      return tops.filter((top) => Math.abs(top - first) < 1).length;
    });

const LOCKS = {
  'permission-lost': async (page: Page, vacancy: ContentFixture) => {
    await page.route(contentUrl(vacancy.id), async (route) => {
      if (route.request().method() === 'PATCH')
        return route.fulfill(await problemFulfill(403, 'FORBIDDEN'));
      const response = await route.fetch();
      return route.fulfill({
        response,
        json: { ...(await response.json()), canEditContent: false },
      });
    });
    await saveContent(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: tc.permissionLost }),
    ).toBeVisible();
  },
  filled: async (page: Page, vacancy: ContentFixture) => {
    await setContentStatus(vacancy, 'FILLED');
    await saveContent(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: tc.filled }),
    ).toBeVisible();
  },
  saving: async (page: Page, vacancy: ContentFixture) => {
    await page.route(contentUrl(vacancy.id), (route) =>
      route.request().method() === 'PATCH'
        ? new Promise<void>(() => {})
        : route.fallback(),
    );
    await saveContent(page).click();
    await expect(
      page.getByRole('button', { name: tc.saving, exact: true }),
    ).toBeVisible();
  },
} as const;

test.describe('content toolbar on a phone [VAC-08, ADR-020, M1, M3, M7]', () => {
  test.use({ storageState: sessionFile(RECRUITER) });
  test.skip(({ isMobile }) => !isMobile, 'a touch viewport case');

  test('M7: the alert of a failed save is in the viewport at 390x844', async ({
    page,
    vacancy,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openContent(page, vacancy);
    await replaceText(editor(page, 'description'), EDITED);
    await page.route(contentUrl(vacancy.id), async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(await problemFulfill(500, 'INTERNAL'))
        : route.fallback(),
    );
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await saveContent(page).click();
    await expect(
      page.getByRole('alert').filter({ hasText: tc.feedback.server }),
    ).toBeInViewport({ ratio: 1 });
  });

  for (const width of [320, 360, 390])
    test(`More keeps its box at ${width} px and two taps toggle it without Heading 1`, async ({
      page,
      vacancy,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await withoutPressScale(page);
      await openContent(page, vacancy);
      const control = more(page);
      await control.scrollIntoViewIfNeeded();
      const closed = await control.boundingBox();
      const { x, y } = await pointOf(control);

      await page.touchscreen.tap(x, y);
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await expect(headingOne(page)).toBeVisible();
      expect(await control.boundingBox()).toEqual(closed);

      await page.touchscreen.tap(x, y);
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      await expect(headingOne(page)).toHaveCount(0);
      expect(await control.boundingBox()).toEqual(closed);
      await expect(editor(page, 'description').locator('h1')).toHaveCount(0);
      await expect(saveContent(page)).toHaveAttribute('aria-disabled', 'true');
    });

  test('every toolbar target is at least 44x44 px at 320, 360, 390 and 300 px, without page overflow', async ({
    page,
    vacancy,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withoutPressScale(page);
    await openContent(page, vacancy);
    await touch(page, more(page));
    await expect(headingOne(page)).toBeVisible();
    for (const width of [320, 360, 390, 300]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => hasPageOverflow(page)).toBe(false);
      if (width >= 320) expect(await firstRowCount(page)).toBe(6);
      const targets = await measureTargets(page);
      expect(targets).toHaveLength(10);
      for (const { width: wide, height } of targets) {
        expect(wide).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(height).toBeGreaterThanOrEqual(MIN_TARGET);
      }
    }
  });

  test('at a 125% browser default font: 4 columns at 320, 5 at 360 and 390, 6 from 400, 55 px targets, More in row 2 with one box', async ({
    page,
    vacancy,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await withoutPressScale(page);
    await setBrowserDefaultFont(page, 20);
    await openContent(page, vacancy);
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).fontSize,
        ),
      )
      .toBe('20px');
    const expectLargeTargets = async () => {
      for (const { width, height } of await measureTargets(page)) {
        expect(width).toBeGreaterThanOrEqual(LARGE_TARGET);
        expect(height).toBeGreaterThanOrEqual(LARGE_TARGET);
      }
    };
    for (const [width, columns] of [
      [320, 4],
      [360, 5],
      [390, 5],
      [400, 6],
      [430, 6],
    ] as const) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => hasPageOverflow(page)).toBe(false);
      expect(await firstRowCount(page)).toBe(columns);
      expect(await measureTargets(page)).toHaveLength(6);
      await expectLargeTargets();
      const control = more(page);
      await control.scrollIntoViewIfNeeded();
      const closed = (await control.boundingBox())!;
      if (columns < 6) {
        const first = (await toolbar(page)
          .locator('button')
          .first()
          .boundingBox())!;
        expect(closed.y).toBeGreaterThanOrEqual(first.y + first.height);
      }
      await touch(page, control);
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      expect(await control.boundingBox()).toEqual(closed);
      await expect.poll(() => hasPageOverflow(page)).toBe(false);
      await expectLargeTargets();
      await touch(page, control);
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      expect(await control.boundingBox()).toEqual(closed);
    }
  });

  test('M1: the no-changes hint shows on a pristine form and leaves after a save', async ({
    page,
    vacancy,
  }) => {
    await openContent(page, vacancy);
    await expect(noChangesHint(page)).toBeVisible();
    await replaceText(editor(page, 'description'), EDITED);
    await saveContent(page).click();
    await expect(saved(page)).toBeVisible();
    await expect(noChangesHint(page)).toHaveCount(0);
  });

  test('M1: the no-changes hint is absent when an editor chunk failed', async ({
    page,
    vacancy,
  }) => {
    const runtime = await editorRuntimePath();
    await page.route(
      (url) => url.pathname === runtime,
      (route) => route.abort('failed'),
    );
    await openHydrated(page, contentPath(vacancy.id));
    await expect(
      page.getByRole('alert').filter({ hasText: tr.loadFailed }),
    ).toHaveCount(2);
    await expect(noChangesHint(page)).toHaveCount(0);
  });

  for (const [state, lock] of Object.entries(LOCKS)) {
    test(`M3 ${state}: a closed More is locked and does not open`, async ({
      page,
      vacancy,
    }) => {
      await openContent(page, vacancy);
      await replaceText(editor(page, 'description'), EDITED);
      await lock(page, vacancy);
      const control = more(page);
      await expect(control).toHaveAttribute('aria-disabled', 'true');
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      await touch(page, control);
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      await expect(headingOne(page)).toHaveCount(0);
    });

    test(`M3 ${state}: a More left open closes with one tap and cannot reopen`, async ({
      page,
      vacancy,
    }) => {
      await openContent(page, vacancy);
      await replaceText(editor(page, 'description'), EDITED);
      const control = more(page);
      await touch(page, control);
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await lock(page, vacancy);
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await expect(control).not.toHaveAttribute('aria-disabled', 'true');

      await touch(page, control);
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      await expect(control).toHaveAttribute('aria-disabled', 'true');
      await expect(headingOne(page)).toHaveCount(0);

      await touch(page, control);
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      await expect(headingOne(page)).toHaveCount(0);
    });
  }
});
