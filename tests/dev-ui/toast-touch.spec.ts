import { expect, test, type Locator, type Page } from '@playwright/test';
import { checkAccessibility } from '../support/accessibility';
import { openGallery } from '../support/dev-ui';
import {
  closeButton,
  dialog,
  freezeClock,
  group,
  isRemoving,
  lineCount,
  listItem,
  openDialog,
  raise,
  raiseFromDialog,
  t,
  toastItems,
  toastWith,
  topmostAt,
  trigger,
  untilGone,
  warmToasts,
} from '../support/toast';

const BOTTOM_NAV = 64;
const GAP = 12;

const withBottomNav = (page: Page) =>
  page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div data-bottom-nav hidden></div>',
    );
  });

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no box');
  return rect;
};

/** The toast slides in from below the window; measure only after two identical reads. */
async function settledBox(locator: Locator) {
  let previous = '';
  await expect
    .poll(async () => {
      const current = JSON.stringify(await box(locator));
      const same = current === previous;
      previous = current;
      return same;
    })
    .toBe(true);
  return box(locator);
}

const titleCentre = async (toast: Locator, title: string) => {
  const rect = await settledBox(toast.getByText(title, { exact: true }));
  return { x: rect.x + 20, y: rect.y + rect.height / 2 };
};

/** Real touch input: Chromium turns it into the pointer events Sonner's swipe listens to. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  steps: readonly number[],
  beforeRelease: () => Promise<void> = async () => undefined,
) {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [from],
  });
  for (const dx of steps)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + dx, y: from.y }],
    });
  await beforeRelease();
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}

test.describe('Toast on touch [UI-F7]', () => {
  test('a tap on the close button closes the toast; its hit area is 44 px', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.tones, t.info).tap();
    const toast = toastWith(page, t.infoTitle);
    await expect(toast).toBeVisible();
    const close = closeButton(toast);
    for (const [dx, dy] of [
      [-21.5, 0],
      [21.5, 0],
      [0, -21.5],
      [0, 21.5],
    ] as const)
      await expect.poll(() => topmostAt(close, dx, dy)).toBe(true);
    await close.tap();
    await expect(toastItems(page)).toHaveCount(0);
  });

  test('the action button is 44 px high and a tap runs it once and closes the toast', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.action, t.withAction).tap();
    const toast = toastWith(page, t.successTitle);
    await expect(toast).toBeVisible();
    const action = toast.getByRole('button', { name: t.open, exact: true });
    expect((await box(action)).height).toBeGreaterThanOrEqual(44);
    await action.tap();
    await expect(toastItems(page)).toHaveCount(0);
    await expect(group(page, t.action)).toContainText(
      t.actionCount.replace('{count}', '1'),
    );
  });

  test('a quick swipe to the right dismisses the toast', async ({ page }) => {
    await openGallery(page);
    await trigger(page, t.action, t.withAction).tap();
    const toast = toastWith(page, t.successTitle);
    await expect(toast).toBeVisible();
    const from = await titleCentre(toast, t.successTitle);
    await drag(page, from, [20, 50, 80, 110, 140, 160]);
    await expect(toastItems(page)).toHaveCount(0);
  });

  test('a swipe to the left is dampened and keeps the toast', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.successTitle);
    await raise(page, trigger(page, t.action, t.withAction), toast);
    const from = await titleCentre(toast, t.successTitle);
    await drag(page, from, [-20, -60, -120, -160], () =>
      page.clock.runFor(1_000),
    );
    await page.clock.runFor(1_000);
    await expect(toast).toBeVisible();
    expect(await isRemoving(toast)).toBe(false);
  });

  test('a short drag that is slower than a flick springs back and keeps the toast', async ({
    page,
  }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.successTitle);
    await raise(page, trigger(page, t.action, t.withAction), toast);
    const before = await settledBox(listItem(toast));
    const from = await titleCentre(toast, t.successTitle);
    await drag(page, from, [2, 4, 6, 8, 10], async () => {
      await expect
        .poll(async () => (await box(listItem(toast))).x - before.x)
        .toBeGreaterThan(3);
      await page.clock.runFor(1_000);
    });
    await expect
      .poll(async () => Math.abs((await box(listItem(toast))).x - before.x))
      .toBeLessThan(1);
    await expect(toast).toBeVisible();
    expect(await isRemoving(toast)).toBe(false);
  });

  test('a slow drag past 45 px dismisses the toast', async ({ page }) => {
    await openGallery(page);
    await warmToasts(page);
    await freezeClock(page);
    const toast = toastWith(page, t.successTitle);
    await raise(page, trigger(page, t.action, t.withAction), toast);
    const before = await settledBox(listItem(toast));
    const from = await titleCentre(toast, t.successTitle);
    await drag(page, from, [10, 30, 50, 70], async () => {
      await expect
        .poll(async () => (await box(listItem(toast))).x - before.x)
        .toBeGreaterThan(45);
      await page.clock.runFor(2_000);
    });
    await untilGone(page, toast);
  });
});

test.describe('Toast layout on a phone [UI-F7]', () => {
  test('the toast stays inside the 390 px viewport and the page does not scroll sideways', async ({
    page,
  }) => {
    await openGallery(page);
    const before = await horizontalOverflow(page);
    await trigger(page, t.worst, t.long).tap();
    const toast = toastWith(page, t.longTitle);
    await expect(toast).toBeVisible();
    const rect = await settledBox(toast);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(844);
    expect(await horizontalOverflow(page)).toBe(before);
    expect(before).toBeLessThanOrEqual(0);
  });

  test('the toast rests 12 px above the bottom edge, and 12 px above the bottom navigation when it is present', async ({
    page,
  }) => {
    await openGallery(page);
    await trigger(page, t.titleOnly, t.success).tap();
    const toast = toastWith(page, t.successTitle);
    await expect(toast).toBeVisible();
    const gap = async () => {
      const rect = await box(listItem(toast));
      return 844 - (rect.y + rect.height);
    };
    await expect.poll(gap).toBeCloseTo(GAP, 0);
    await withBottomNav(page);
    await expect.poll(gap).toBeCloseTo(BOTTOM_NAV + GAP, 0);
  });

  test('with the bottom navigation present a tall toast keeps its top edge in the viewport', async ({
    page,
  }) => {
    await openGallery(page);
    await withBottomNav(page);
    await trigger(page, t.worst, t.long).tap();
    const toast = toastWith(page, t.longTitle);
    await expect(toast).toBeVisible();
    const rect = await settledBox(toast);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(
      844 - BOTTOM_NAV - GAP + 1,
    );
  });

  test('at 320 px a long title wraps, the description keeps two lines and nothing leaves the screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openGallery(page);
    await withBottomNav(page);
    const before = await horizontalOverflow(page);
    await trigger(page, t.worst, t.long).tap();
    const toast = toastWith(page, t.longTitle);
    await expect(toast).toBeVisible();

    const rect = await settledBox(toast);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(320);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(
      640 - BOTTOM_NAV - GAP + 1,
    );
    expect(await horizontalOverflow(page)).toBe(before);
    expect(before).toBeLessThanOrEqual(0);

    const title = toast.getByText(t.longTitle, { exact: true });
    const body = toast.getByText(t.longDescription, { exact: true });
    expect(await lineCount(title)).toBeGreaterThan(3);
    expect(await lineCount(body)).toBe(2);
    const edges = await toast.evaluate((node) => {
      const outer = node.getBoundingClientRect();
      return Array.from(node.querySelectorAll('p, button')).map(
        (element) => element.getBoundingClientRect().right <= outer.right + 0.5,
      );
    });
    expect(edges.every(Boolean)).toBe(true);
  });

  test('the toast is above a bottom-sheet dialog, the tap on its close button leaves the dialog open', async ({
    page,
  }) => {
    await openGallery(page);
    await openDialog(page);
    const toast = await raiseFromDialog(page);
    await expect.poll(() => topmostAt(toast)).toBe(true);
    const close = closeButton(toast);
    await expect.poll(() => topmostAt(close)).toBe(true);
    await close.tap();
    await expect(toastItems(page)).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
  });

  test('a tap on the toast action over a dialog runs it and keeps the dialog', async ({
    page,
  }) => {
    await openGallery(page);
    await openDialog(page);
    const toast = await raiseFromDialog(page);
    await toast.getByRole('button', { name: t.open, exact: true }).tap();
    await expect(toastItems(page)).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe('Toast accessibility on a phone [UI-F7]', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe is clean with the worst-case error toast above the bottom navigation (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await withBottomNav(page);
      await trigger(page, t.worst, t.long).tap();
      await expect(toastWith(page, t.longTitle)).toBeVisible();
      await checkAccessibility(page, testInfo);
    });

    test(`axe is clean with a toast over a bottom-sheet dialog (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await openDialog(page);
      await raiseFromDialog(page);
      await checkAccessibility(page, testInfo);
    });
  }
});
