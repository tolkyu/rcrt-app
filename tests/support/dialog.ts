import { expect, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection } from './dev-ui';

export const t = messages.devUi.dialogs;
export const c = messages.common;

export const section = (page: Page) => gallerySection(page, t.title);

/** A gallery group is the card around an `<h3>`; its buttons share labels with other groups. */
export const group = (page: Page, title: string) =>
  section(page)
    .getByRole('heading', { level: 3, name: title, exact: true })
    .locator('xpath=../..');

export const open = (page: Page, groupTitle: string, name: string) =>
  group(page, groupTitle).getByRole('button', { name, exact: true });

export const modal = (page: Page) =>
  page.locator(
    '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]',
  );

export const confirmButton = (page: Page, name: string = t.reasonConfirm) =>
  page.getByRole('alertdialog').getByRole('button', { name });
export const cancelButton = (page: Page, name: string = c.cancel) =>
  page.getByRole('alertdialog').getByRole('button', { name, exact: true });

export const animationName = (element: Locator) =>
  element.evaluate((node) => getComputedStyle(node).animationName);

export const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no box');
  return rect;
};

/** The element at the centre of `locator`, climbed to see whether it is, or sits inside, `ancestor`. */
export const isTopmostIn = (locator: Locator, ancestor: string) =>
  locator.evaluate((node, selector) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return hit?.closest(selector) != null;
  }, ancestor);

/** Slows a token so a test can read the running animation instead of racing it. */
export const slow = (page: Page, token: string) =>
  page.addStyleTag({ content: `:root { ${token}: 10s; }` });

export const expectGone = (locator: Locator) => expect(locator).toHaveCount(0);

/** A bounding box taken mid-animation is scaled or shifted; jump the open animation to its end first. */
export const settled = (locator: Locator) =>
  locator.evaluate((node) =>
    node.getAnimations().forEach((animation) => animation.finish()),
  );

/** The painted extent of a button's text, not of the button around it. */
export const labelBox = (button: Locator) =>
  button.evaluate((node) => {
    const text = [...node.childNodes].find(
      (child) => child.nodeType === Node.TEXT_NODE,
    );
    if (!text) throw new Error('button has no text node');
    const range = document.createRange();
    range.selectNodeContents(text);
    const { left, right, top, bottom } = range.getBoundingClientRect();
    return { left, right, top, bottom };
  });

/** Every action sits inside the dialog and shows its whole label (WCAG 1.4.10). */
export async function expectActionsContained(
  dialog: Locator,
  actions: readonly Locator[],
) {
  const frame = await box(dialog);
  for (const action of actions) {
    const rect = await box(action);
    expect(rect.x).toBeGreaterThanOrEqual(frame.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(
      await action.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(0);
  }
}
