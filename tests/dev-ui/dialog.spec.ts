import { expect, test, type Page } from '@playwright/test';
import { checkAccessibility } from '../support/accessibility';
import {
  animationName,
  box,
  c,
  cancelButton,
  confirmButton,
  expectActionsContained,
  labelBox,
  group,
  isTopmostIn,
  modal,
  open,
  section,
  settled,
  slow,
  t,
} from '../support/dialog';
import { openGallery } from '../support/dev-ui';

const SIZES = [
  { key: 'sm', rem: 28 },
  { key: 'md', rem: 36 },
  { key: 'lg', rem: 48 },
] as const;

const reasonField = (page: Page) => page.getByRole('textbox');

test.describe('Dialog family and ConfirmDialog [UI-F8]', () => {
  for (const { key, rem } of SIZES) {
    test(`size ${key} is ${rem} rem wide with radius 16, icon tile, subtitle and a right-aligned footer`, async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.sizes, t.sizeLabel[key]).click();
      const dialog = page.getByRole('dialog', { name: t.inviteTitle });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleDescription(t.inviteSubtitle);
      await settled(dialog);
      const rect = await box(dialog);
      expect(rect.width).toBe(rem * 16);
      expect(
        await dialog.evaluate((node) => getComputedStyle(node).borderRadius),
      ).toBe('16px');
      const send = dialog.getByRole('button', { name: t.send });
      const cancel = dialog.getByRole('button', { name: c.cancel });
      const [sendBox, cancelBox] = [await box(send), await box(cancel)];
      expect(sendBox.x).toBeGreaterThan(cancelBox.x);
      expect(sendBox.y).toBe(cancelBox.y);
      // 24 px padding + 1 px border on the right.
      expect(Math.round(rect.x + rect.width - sendBox.x - sendBox.width)).toBe(
        25,
      );
    });
  }

  test('a dialog scales in with the strong ease-out; Escape closes it and returns focus to the trigger', async ({
    page,
  }) => {
    await openGallery(page);
    await slow(page, '--duration-dialog');
    const trigger = open(page, t.sizes, t.sizeLabel.sm);
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await animationName(dialog)).toBe('motion-pop-in');
    expect(
      await dialog.evaluate(
        (node) => getComputedStyle(node).animationTimingFunction,
      ),
    ).toBe('cubic-bezier(0.23, 1, 0.32, 1)');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    await expect(trigger).toBeFocused();
  });

  test.describe('ConfirmDialog', () => {
    test('Cancel holds the initial focus; Escape cancels and focus returns to the trigger', async ({
      page,
    }) => {
      await openGallery(page);
      const trigger = open(page, t.confirms, t.destructive);
      await trigger.click();
      const dialog = page.getByRole('alertdialog', {
        name: t.destructiveTitle,
      });
      await expect(dialog).toBeVisible();
      await expect(cancelButton(page)).toBeFocused();
      await expect(dialog).toHaveAccessibleDescription(
        t.destructiveDescription,
      );
      await expect(dialog.getByRole('listitem')).toHaveText([
        t.consequenceList,
        t.consequenceHistory,
      ]);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test('a press on the overlay cancels, Enter on the focused Cancel cancels, Tab stays inside', async ({
      page,
    }) => {
      await openGallery(page);
      const trigger = open(page, t.confirms, t.neutral);
      await trigger.click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await page.mouse.click(5, 5);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(dialog.locator(':focus')).toHaveCount(1);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Enter');
      await expect(dialog).toHaveCount(0);
    });

    test('the destructive confirm is --destructive, the neutral one is the primary colour', async ({
      page,
    }) => {
      await openGallery(page);
      const background = (name: string) =>
        page
          .getByRole('alertdialog')
          .getByRole('button', { name, exact: true })
          .evaluate((node) => getComputedStyle(node).backgroundColor);
      await open(page, t.confirms, t.destructive).click();
      expect(await background(t.destructiveConfirm)).toBe('rgb(220, 38, 38)');
      await page.keyboard.press('Escape');
      await open(page, t.confirms, t.neutral).click();
      expect(await background(t.neutralConfirm)).not.toBe('rgb(220, 38, 38)');
    });

    test('with a reason, confirm stays unavailable and explained until a visible character is typed', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.confirms, t.withReason).click();
      const confirm = confirmButton(page);
      await expect(confirm).toHaveAttribute('aria-disabled', 'true');
      await expect(confirm).toHaveAccessibleDescription(
        c.confirmReasonRequired,
      );
      await expect(cancelButton(page, t.reasonCancel)).toBeFocused();
      await reasonField(page).fill('   \n \u200B ');
      await expect(confirm).toHaveAttribute('aria-disabled', 'true');
      // Playwright treats aria-disabled as not actionable; the press must still do nothing.
      await confirm.click({ force: true });
      await expect(confirm).not.toHaveAttribute('aria-busy', /.*/);
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(
        page.getByText(t.confirmed.replace('{count}', '0')),
      ).toBeVisible();
      await reasonField(page).fill('Кандидата знайдено\nвнутрішньо');
      await expect(confirm).not.toHaveAttribute('aria-disabled', /.*/);
      await expect(page.getByText('29/500')).toBeVisible();
    });

    test('a reason over the limit blocks confirm with its own message', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.confirms, t.withReason).click();
      await reasonField(page).fill('я'.repeat(501));
      await expect(confirmButton(page)).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await expect(confirmButton(page)).toHaveAccessibleDescription(
        c.confirmReasonTooLong.replace('{max}', '500'),
      );
      await reasonField(page).fill('я'.repeat(500));
      await expect(confirmButton(page)).not.toHaveAttribute(
        'aria-disabled',
        /.*/,
      );
    });

    test('pending: one request however often confirm is pressed, the width holds, the spinner fades in after 150 ms and Escape is ignored', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.confirms, t.withReason).click();
      await reasonField(page).fill('Причина');
      const confirm = confirmButton(page);
      await settled(page.getByRole('alertdialog'));
      const before = await box(confirm);
      await confirm.dblclick();
      await expect(confirm).toHaveAttribute('aria-busy', 'true');
      const spinner = confirm.locator('.skeleton-delayed');
      expect(
        await spinner.evaluate((node) =>
          node
            .getAnimations()
            .map((animation) => animation.effect?.getTiming().delay),
        ),
      ).toEqual([150]);
      expect((await box(confirm)).width).toBe(before.width);
      await expect
        .poll(() => spinner.evaluate((node) => getComputedStyle(node).opacity))
        .toBe('1');
      expect(
        await spinner
          .locator('svg')
          .evaluate((node) => getComputedStyle(node).animationDuration),
      ).toBe('0.6s');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(
        page.getByText(t.confirmed.replace('{count}', '1')),
      ).toBeVisible();
    });

    test('a 409 stays inside the dialog as an alert, the dialog keeps its reason and can retry', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.confirms, t.conflict).click();
      await reasonField(page).fill('Причина');
      await confirmButton(page).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog.getByRole('alert')).toHaveText(t.conflictMessage);
      await expect(confirmButton(page)).not.toHaveAttribute('aria-busy', /.*/);
      await expect(reasonField(page)).toHaveValue('Причина');
      await confirmButton(page).click();
      await expect(dialog.getByRole('alert')).toHaveText(t.conflictMessage);
      await expect(
        page.getByText(t.confirmed.replace('{count}', '0')),
      ).toBeVisible();
    });

    test('worst case: a 200-character unbroken title and a 500-character reason wrap without overflow', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.confirms, t.worst).click();
      const dialog = page.getByRole('alertdialog');
      await reasonField(page).fill('Ж'.repeat(500));
      await expect(page.getByText('500/500')).toBeVisible();
      const overflow = await dialog.evaluate(
        (node) => node.scrollWidth - node.clientWidth,
      );
      expect(overflow).toBe(0);
      await settled(dialog);
      expect((await box(dialog)).width).toBe(448);
      await expect(confirmButton(page)).toBeVisible();
    });

    test('long action labels wrap inside the dialog and the spinner keeps clear of a short label', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.confirms, t.longLabels).click();
      const dialog = page.getByRole('alertdialog');
      await settled(dialog);
      await expectActionsContained(dialog, [
        cancelButton(page, t.longCancel),
        confirmButton(page, t.longConfirm),
      ]);
      await page.keyboard.press('Escape');

      await open(page, t.confirms, t.withReason).click();
      await page.getByRole('textbox').fill('Причина');
      await confirmButton(page).click();
      const spinner = confirmButton(page).locator('.skeleton-delayed');
      await expect(spinner).toBeVisible();
      const gap =
        (await labelBox(confirmButton(page))).left -
        ((await box(spinner)).x + (await box(spinner)).width);
      expect(gap).toBeGreaterThanOrEqual(4);
    });

    test('reopening starts with an empty reason', async ({ page }) => {
      await openGallery(page);
      const trigger = open(page, t.confirms, t.withReason);
      await trigger.click();
      await reasonField(page).fill('Залишок');
      await page.keyboard.press('Escape');
      await trigger.click();
      await expect(reasonField(page)).toHaveValue('');
    });
  });

  test.describe('layers', () => {
    test('a Select list and a dropdown menu open above the dialog; a toast sits above both and does not close it', async ({
      page,
    }) => {
      await openGallery(page);
      await open(page, t.layers, t.layersOpen).click();
      const dialog = page.getByRole('dialog', { name: t.layersTitle });
      await expect(dialog).toBeVisible();

      await dialog.getByLabel(t.verticalLabel).click();
      const list = page.getByRole('listbox');
      await expect(list).toBeVisible();
      expect(await isTopmostIn(list, '[role="listbox"]')).toBe(true);
      await page.getByRole('option', { name: t.optionCrypto }).click();

      await dialog.getByRole('button', { name: t.menuLabel }).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      expect(await isTopmostIn(menu, '[role="menu"]')).toBe(true);
      await page.keyboard.press('Escape');

      await dialog.getByRole('button', { name: t.raise }).click();
      const toast = page.locator('[data-slot="toast"]', { hasText: t.raised });
      await expect(toast).toBeVisible();
      // The toast slides in from below the window; poll until it is under the pointer.
      await expect
        .poll(() => isTopmostIn(toast, '[data-sonner-toaster]'))
        .toBe(true);
      await toast.click();
      await expect(dialog).toBeVisible();
    });

    test('a dropdown menu grows from its trigger corner, not the centre', async ({
      page,
    }) => {
      await openGallery(page);
      await slow(page, '--duration-popover');
      await open(page, t.layers, t.layersOpen).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: t.menuLabel }).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      expect(await animationName(menu)).toBe('motion-pop-in');
      expect(
        await menu.evaluate((node) => {
          const { transformOrigin } = getComputedStyle(node);
          const { offsetWidth, offsetHeight } = node as HTMLElement;
          return (
            transformOrigin === `${offsetWidth / 2}px ${offsetHeight / 2}px`
          );
        }),
      ).toBe(false);
    });
  });

  test.describe('Sheet', () => {
    for (const { key, px } of [
      { key: 'sm', px: 360 },
      { key: 'md', px: 400 },
      { key: 'lg', px: 480 },
    ] as const) {
      test(`the ${px} px drawer opens at that width, slides in from the right with the drawer curve`, async ({
        page,
      }) => {
        await openGallery(page);
        await slow(page, '--duration-drawer');
        await open(page, t.sheets, t.sheetLabel[key]).click();
        const sheet = page.getByRole('dialog', { name: t.sheetTitle });
        await expect(sheet).toBeVisible();
        expect(await animationName(sheet)).toBe('motion-sheet-side-in');
        expect(
          await sheet.evaluate(
            (node) => getComputedStyle(node).animationTimingFunction,
          ),
        ).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
        expect(
          await sheet.evaluate((node) => getComputedStyle(node).translate),
        ).not.toMatch(/^(none|0px)$/);
        await expect.poll(async () => (await box(sheet)).width).toBe(px);
      });
    }

    test('Escape closes only the dialog opened from a sheet, then the sheet; focus walks back', async ({
      page,
    }) => {
      await openGallery(page);
      const trigger = open(page, t.sheets, t.sheetLabel.md);
      await trigger.click();
      const sheet = page.getByRole('dialog', { name: t.sheetTitle });
      const nestedTrigger = sheet.getByRole('button', { name: t.sheetNested });
      await nestedTrigger.click();
      const nested = page.getByRole('dialog', { name: t.sheetNestedTitle });
      await expect(nested).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(nested).toHaveCount(0);
      await expect(sheet).toBeVisible();
      await expect(nestedTrigger).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });

  test.describe('menu animation', () => {
    test('a pointer-opened menu animates from its trigger; a keyboard-opened one carries data-instant and has no animation', async ({
      page,
    }) => {
      await openGallery(page);
      await slow(page, '--duration-popover');
      const menuGroup = group(page, t.menus);
      const trigger = menuGroup.getByRole('button', { name: t.menuTrigger });
      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      expect(await animationName(menu)).toBe('motion-pop-in');
      await expect(menu).not.toHaveAttribute('data-instant', /.*/);
    });

    test('the input source is read on every open: keyboard then pointer animates, pointer then keyboard does not', async ({
      page,
    }) => {
      await openGallery(page);
      await slow(page, '--duration-popover');
      const trigger = group(page, t.menus).getByRole('button', {
        name: t.menuTrigger,
      });
      const menu = page.getByRole('menu');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      expect(await animationName(menu)).toBe('none');
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);

      await trigger.click();
      await expect(menu).toBeVisible();
      expect(await animationName(menu)).toBe('motion-pop-in');
      await expect(menu).not.toHaveAttribute('data-instant', /.*/);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);

      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      expect(await animationName(menu)).toBe('none');
    });

    test('opening with Enter skips the animation and focuses the first item', async ({
      page,
    }) => {
      await openGallery(page);
      await slow(page, '--duration-popover');
      await group(page, t.menus)
        .getByRole('button', { name: t.menuTrigger })
        .focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute('data-instant', '');
      expect(await animationName(menu)).toBe('none');
      await expect(
        menu.getByRole('menuitem', { name: t.menuView }),
      ).toBeFocused();
    });
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('a dialog and a sheet still open and close, as a fade without scale or travel', async ({
      page,
    }) => {
      await openGallery(page);
      expect(
        await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement);
          return [
            style.getPropertyValue('--motion-scale').trim(),
            style.getPropertyValue('--motion-shift').trim(),
          ];
        }),
      ).toEqual(['1', '0%']);
      const trigger = open(page, t.sizes, t.sizeLabel.md);
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate(
          (node) => getComputedStyle(node).animationDuration,
        ),
      ).toBe('0.12s');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await open(page, t.sheets, t.sheetLabel.sm).click();
      const sheet = page.getByRole('dialog', { name: t.sheetTitle });
      await expect(sheet).toBeVisible();
      expect(
        await sheet.evaluate(
          (node) => getComputedStyle(node).animationDuration,
        ),
      ).toBe('0.12s');
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    });
  });

  test.describe('layout stability', () => {
    test('opening and closing a dialog never shifts the page', async ({
      page,
    }) => {
      await openGallery(page);
      const heading = section(page).getByRole('heading', { level: 2 });
      const top = () =>
        heading.evaluate((node) => node.getBoundingClientRect().top + scrollY);
      const before = await top();
      await open(page, t.sizes, t.sizeLabel.lg).click();
      await expect(modal(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(modal(page)).toHaveCount(0);
      expect(await top()).toBe(before);
    });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe: dialog, confirm with reason, conflict and sheet are clean in ${theme}`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await open(page, t.sizes, t.sizeLabel.md).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await checkAccessibility(page, testInfo);
      await page.keyboard.press('Escape');

      await open(page, t.confirms, t.conflict).click();
      await reasonField(page).fill('Причина');
      await confirmButton(page).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await checkAccessibility(page, testInfo);
      await page.keyboard.press('Escape');

      await open(page, t.confirms, t.worst).click();
      await checkAccessibility(page, testInfo);
      await page.keyboard.press('Escape');

      await open(page, t.sheets, t.sheetLabel.md).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await checkAccessibility(page, testInfo);
    });
  }
});
