import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  gallerySection,
  openGallery,
  settleFrames,
  tabAfter,
} from '../support/dev-ui';

const t = messages.devUi.tooltip;
const section = (page: Page) => gallerySection(page, t.title);
const action = (page: Page, name: string) =>
  section(page).getByRole('button', { name, exact: true });
const attempts = (page: Page) => section(page).locator('output');
const reasonText = (page: Page, text: string) =>
  section(page).getByText(text, { exact: true });

/** Playwright treats aria-disabled as not enabled, hence `force` on clicks below: the point is that nothing happens. */
const describedBy = (button: Locator) =>
  button.evaluate((node) => {
    const ids = (node.getAttribute('aria-describedby') ?? '').split(' ');
    return ids.map((id) => document.getElementById(id)?.textContent ?? null);
  });

test.describe('DisabledReason on a pointer device [UI-F2]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('the action is focusable by Tab, aria-disabled and described by its reason', async ({
    page,
  }) => {
    await tabAfter(
      page,
      section(page).getByRole('heading', { name: t.disabled, exact: true }),
    );
    const publish = action(page, t.publish);
    await expect(publish).toBeFocused();
    await expect(publish).toHaveAttribute('aria-disabled', 'true');
    await expect(publish).not.toHaveAttribute('disabled', /.*/);
    expect(new Set(await describedBy(publish))).toEqual(
      new Set([t.publishReason]),
    );
  });

  test('with the tooltip open the reason is announced once, not twice', async ({
    page,
  }) => {
    await tabAfter(
      page,
      section(page).getByRole('heading', { name: t.disabled, exact: true }),
    );
    const publish = action(page, t.publish);
    await expect(publish).toBeFocused();
    await expect(publish).toHaveAttribute('data-state', /.+/);
    await expect(publish).toHaveAccessibleDescription(t.publishReason);
  });

  test('click, Enter and Space on a focused disabled action do nothing', async ({
    page,
  }) => {
    const publish = action(page, t.publish);
    await publish.click({ force: true });
    await expect(publish).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await settleFrames(page);
    await expect(attempts(page)).toContainText(`${t.attempts} 0`);
    await expect(publish).toHaveAttribute('aria-disabled', 'true');
  });

  test('the second disabled action behaves the same', async ({ page }) => {
    const save = action(page, t.save);
    await save.focus();
    await save.click({ force: true });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await settleFrames(page);
    await expect(attempts(page)).toContainText(`${t.attempts} 0`);
    expect(new Set(await describedBy(save))).toEqual(new Set([t.limitReason]));
  });

  test('an available action is a plain button that counts its clicks', async ({
    page,
  }) => {
    const available = action(page, t.available);
    await expect(available).not.toHaveAttribute('aria-disabled', /.*/);
    await expect(available).not.toHaveAttribute('aria-describedby', /.*/);
    await available.click();
    await expect(attempts(page)).toContainText(`${t.attempts} 1`);
  });

  test('the reason is kept for screen readers and not drawn on screen', async ({
    page,
  }) => {
    const box = await reasonText(page, t.publishReason).boundingBox();
    expect(box?.width).toBeLessThanOrEqual(1);
    expect(box?.height).toBeLessThanOrEqual(1);
  });

  test('hover shows the reason in the tooltip too', async ({ page }) => {
    await action(page, t.publish).hover();
    await expect(
      page
        .locator('[data-radix-popper-content-wrapper] .motion-tooltip')
        .filter({ hasText: t.publishReason }),
    ).toBeVisible();
  });
});
