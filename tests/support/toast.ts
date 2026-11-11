import { expect, type Locator, type Page } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection } from './dev-ui';

export const t = messages.devUi.toasts;
export const c = messages.common;

export const section = (page: Page) => gallerySection(page, t.title);

/** A gallery group is the card around an `<h3>`; its buttons share labels with other groups. */
export const group = (page: Page, title: string) =>
  section(page)
    .getByRole('heading', { level: 3, name: title, exact: true })
    .locator('xpath=../..');

export const trigger = (page: Page, groupTitle: string, name: string) =>
  group(page, groupTitle).getByRole('button', { name, exact: true });

export const toastItems = (page: Page) => page.locator('[data-slot="toast"]');
export const toastWith = (page: Page, title: string) =>
  toastItems(page).filter({ hasText: title });
export const closeButton = (toast: Locator) =>
  toast.getByRole('button', { name: c.close, exact: true });
export const toaster = (page: Page) => page.locator('[data-sonner-toaster]');
export const listItem = (toast: Locator) => toast.locator('xpath=ancestor::li');

export const dialog = (page: Page) => page.getByRole('dialog');

export const openDialog = async (page: Page) => {
  await trigger(page, t.layers, t.dialogOpen).click();
  await expect(dialog(page)).toBeVisible();
};

export const raiseFromDialog = async (page: Page) => {
  await dialog(page).getByRole('button', { name: t.dialogRaise }).click();
  const toast = toastWith(page, t.dialogToast);
  await expect(toast).toBeVisible();
  return toast;
};

/** The Sonner chunk loads on the first toast; a later toast must not wait for a Suspense reveal that a frozen clock would never release. */
export async function warmToasts(page: Page) {
  await trigger(page, t.titleOnly, t.success).click();
  const toast = toastWith(page, t.successTitle);
  await expect(toast).toBeVisible();
  await closeButton(toast).click();
  await expect(toastItems(page)).toHaveCount(0);
}

/** Time moves only when a test says so: Sonner's timers, hover pause and removal delay are all clock driven. */
export async function freezeClock(page: Page) {
  const start = new Date(FIXED_CLOCK_ISO);
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1_000));
}

/** Waits for one macrotask so React's passive effects (Sonner's timer start and pause) have run. */
export const flushReact = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      }),
  );

/** Sonner adds a toast on a zero-delay timer, so a click only shows it once the frozen clock ticks. */
export async function raise(page: Page, button: Locator, toast: Locator) {
  await button.click();
  await page.clock.runFor(1);
  await expect(toast).toBeVisible();
  await flushReact(page);
}

/** Dismissal is a frame, then a 200 ms unmount delay that starts only after React renders the removal. */
export async function untilGone(page: Page, toast: Locator) {
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return toast.count();
    })
    .toBe(0);
}

export const isRemoving = async (toast: Locator) =>
  (await listItem(toast).getAttribute('data-removed')) === 'true';

export const lineCount = (element: Locator) =>
  element.evaluate((node) => {
    const style = getComputedStyle(node);
    return Math.round(
      node.getBoundingClientRect().height / parseFloat(style.lineHeight),
    );
  });

/** The toast slides in from below the window, so poll this until the transition has brought it into view. */
export const topmostAt = (target: Locator, dx = 0, dy = 0) =>
  target.evaluate(
    (node, offset) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2 + offset.x,
        rect.top + rect.height / 2 + offset.y,
      );
      return hit !== null && node.contains(hit);
    },
    { x: dx, y: dy },
  );
