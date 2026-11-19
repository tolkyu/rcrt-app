import { expect, test, type Page } from '@playwright/test';
import { checkAccessibility } from '../support/accessibility';
import { openGallery } from '../support/dev-ui';
import {
  animationName,
  box,
  c,
  cancelButton,
  confirmButton,
  expectActionsContained,
  labelBox,
  open,
  settled,
  slow,
  t,
} from '../support/dialog';

const VIEWPORT = { width: 390, height: 844 };
const PADDING = 24;
const BORDER = 1;

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test.describe('Dialog family on a phone [UI-F8, mobile TL flows]', () => {
  test('a dialog is a full-width bottom sheet with a rounded top, a slide-in and a stacked footer with the primary action last', async ({
    page,
  }) => {
    await openGallery(page);
    await slow(page, '--duration-drawer');
    await open(page, t.sizes, t.sizeLabel.md).click();
    const dialog = page.getByRole('dialog', { name: t.inviteTitle });
    await expect(dialog).toBeVisible();

    expect(await animationName(dialog)).toBe('motion-sheet-up-in');
    expect(
      await dialog.evaluate((node) => getComputedStyle(node).translate),
    ).not.toMatch(/^(none|0px)$/);

    await settled(dialog);
    const rect = await box(dialog);
    expect([rect.x, rect.width, rect.y + rect.height]).toEqual([
      0,
      VIEWPORT.width,
      VIEWPORT.height,
    ]);
    expect(
      await dialog.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.borderTopLeftRadius, style.borderBottomLeftRadius];
      }),
    ).toEqual(['24px', '0px']);

    const cancel = dialog.getByRole('button', { name: c.cancel });
    const send = dialog.getByRole('button', { name: t.send });
    const [cancelBox, sendBox] = [await box(cancel), await box(send)];
    expect(sendBox.y).toBeGreaterThan(cancelBox.y + cancelBox.height);
    expect(sendBox.x).toBe(cancelBox.x);
    expect(sendBox.width).toBe(VIEWPORT.width - 2 * (PADDING + BORDER));
    expect(cancelBox.width).toBe(sendBox.width);
    expect(sendBox.height).toBeGreaterThanOrEqual(44);
    expect(cancelBox.height).toBeGreaterThanOrEqual(44);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('ConfirmDialog is a sheet too: Cancel above, a full-width destructive confirm last, the reason shown as text under it', async ({
    page,
  }) => {
    await openGallery(page);
    await open(page, t.confirms, t.withReason).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await settled(dialog);
    const cancel = cancelButton(page, t.reasonCancel);
    const confirm = confirmButton(page);
    await expect(cancel).toBeFocused();
    const [cancelBox, confirmBox] = [await box(cancel), await box(confirm)];
    expect(confirmBox.y).toBeGreaterThan(cancelBox.y + cancelBox.height);
    expect(confirmBox.width).toBe(cancelBox.width);
    expect(confirmBox.height).toBeGreaterThanOrEqual(44);

    // Touch has no tooltip: the blocker is visible text directly below the button.
    const helper = dialog.getByText(c.confirmReasonRequired, { exact: true });
    const helperBox = await box(helper);
    expect(helperBox.height).toBeGreaterThan(10);
    expect(helperBox.y).toBeGreaterThanOrEqual(
      confirmBox.y + confirmBox.height,
    );
    expect(
      await helper.evaluate((node) => getComputedStyle(node).fontSize),
    ).toBe('12px');

    const field = page.getByRole('textbox');
    expect((await box(field)).height).toBeGreaterThanOrEqual(44);
    expect(
      await field.evaluate((node) => getComputedStyle(node).fontSize),
    ).toBe('16px');
    const heightBefore = (await box(dialog)).height;
    await field.fill('Причина');
    await expect(confirm).not.toHaveAttribute('aria-disabled', /.*/);
    await expect(helper).toHaveCount(0);
    // The helper line goes, its space stays: a bottom-anchored sheet must not jump.
    expect((await box(dialog)).height).toBeCloseTo(heightBefore, 0);
  });

  test('a touch tablet at 820 px keeps the dialog height when the reason is typed, too [UI-F8.1]', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await openGallery(page);
    await open(page, t.confirms, t.withReason).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await settled(dialog);
    const helper = dialog.getByText(c.confirmReasonRequired, { exact: true });
    await expect(helper).toBeVisible();
    const heightBefore = (await box(dialog)).height;
    await page.getByRole('textbox').fill('Причина');
    await expect(helper).toHaveCount(0);
    expect((await box(dialog)).height).toBeCloseTo(heightBefore, 0);
  });

  test('worst-case content wraps inside the sheet and the page never scrolls sideways', async ({
    page,
  }) => {
    await openGallery(page);
    await open(page, t.confirms, t.worst).click();
    const dialog = page.getByRole('alertdialog');
    await page.getByRole('textbox').fill('Ж'.repeat(500));
    expect(
      await dialog.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBe(0);
    expect(await horizontalOverflow(page)).toBe(0);
    await settled(dialog);
    const rect = await box(dialog);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(VIEWPORT.height);
    await confirmButton(page).scrollIntoViewIfNeeded();
    await expect(confirmButton(page)).toBeInViewport();
  });

  for (const width of [390, 320]) {
    test(`long action labels (31 and 58 characters) wrap at ${width} px: nothing overflows, the spinner clears the label`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      await openGallery(page);
      await open(page, t.confirms, t.longLabels).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await settled(dialog);
      const cancel = cancelButton(page, t.longCancel);
      const confirm = confirmButton(page, t.longConfirm);
      await page.getByRole('textbox').fill('Причина');
      await expectActionsContained(dialog, [cancel, confirm]);
      expect(
        await dialog.evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBe(0);
      expect(await horizontalOverflow(page)).toBe(0);
      for (const action of [cancel, confirm])
        expect((await box(action)).height).toBeGreaterThanOrEqual(44);
      expect((await box(confirm)).height).toBeGreaterThan(48);

      const before = await box(confirm);
      await confirm.click();
      await expect(confirm).toHaveAttribute('aria-busy', 'true');
      const spinner = confirm.locator('.skeleton-delayed');
      await expect(spinner).toBeVisible();
      expect((await box(confirm)).width).toBe(before.width);
      expect((await box(spinner)).x + (await box(spinner)).width).toBeLessThan(
        (await labelBox(confirm)).left,
      );
    });
  }

  test('an outside tap cancels a confirm, a tap on Cancel returns focus to the trigger', async ({
    page,
  }) => {
    await openGallery(page);
    const trigger = open(page, t.confirms, t.neutral);
    await trigger.tap();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.touchscreen.tap(195, 40);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.tap();
    await cancelButton(page).tap();
    await expect(dialog).toHaveCount(0);
  });

  test('a drawer takes the full width on a phone and slides from the right', async ({
    page,
  }) => {
    await openGallery(page);
    await slow(page, '--duration-drawer');
    await open(page, t.sheets, t.sheetLabel.sm).click();
    const sheet = page.getByRole('dialog', { name: t.sheetTitle });
    await expect(sheet).toBeVisible();
    expect(await animationName(sheet)).toBe('motion-sheet-side-in');
    expect((await box(sheet)).width).toBeCloseTo(VIEWPORT.width, 0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe: bottom-sheet dialog and confirm are clean in ${theme}`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await open(page, t.sizes, t.sizeLabel.lg).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await checkAccessibility(page, testInfo);
      await page.keyboard.press('Escape');
      await open(page, t.confirms, t.withReason).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await checkAccessibility(page, testInfo);
    });
  }
});
