import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { checkAccessibility } from '../support/accessibility';
import { gallerySection, openGallery, tabAfter } from '../support/dev-ui';

const t = messages.devUi.select;

const section = (page: Page) => gallerySection(page, t.title);
const field = (page: Page, label: string) =>
  section(page).getByLabel(label, { exact: true });
const popup = (page: Page) =>
  page.locator(
    '[data-radix-popper-content-wrapper] [data-slot="select-content"]',
  );
const option = (page: Page, name: string) =>
  page.getByRole('option', { name, exact: false });

const animationName = (element: Locator) =>
  element.evaluate((node) => getComputedStyle(node).animationName);

test.describe('Select [UI-F3]', () => {
  test('the Radix list is not mounted until the first press and the trigger is a plain button before that', async ({
    page,
  }) => {
    await openGallery(page);
    const trigger = field(page, t.selectedLabel);
    await expect(trigger).not.toHaveAttribute('data-state', /.*/);
    await expect(popup(page)).toHaveCount(0);
    await trigger.click();
    await expect(popup(page)).toBeVisible();
    await expect(
      page.locator('[data-slot="select-trigger"][data-state="open"]'),
    ).toHaveCount(1);
  });

  test('a mouse press opens the list animated from the trigger origin; a keyboard open has no animation', async ({
    page,
  }) => {
    await openGallery(page);
    await page.addStyleTag({ content: ':root { --duration-popover: 10s; }' });
    await field(page, t.selectedLabel).click();
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('motion-pop-in');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(field(page, t.selectedLabel)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('none');
  });

  test('keyboard: Tab focuses the field, Enter opens at once, arrows, Home/End and type-ahead move, Escape returns focus', async ({
    page,
  }) => {
    await openGallery(page);
    await tabAfter(page, section(page).getByRole('heading', { level: 2 }));
    const first = field(page, t.placeholderLabel);
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('End');
    await expect(option(page, t.crypto)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(option(page, t.gambling)).toBeFocused();
    // Playwright cannot press Cyrillic keys, so the key events Radix type-ahead listens to are dispatched.
    for (const key of t.crypto.slice(0, 2))
      await page.evaluate((typed) => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: typed, bubbles: true }),
        );
      }, key);
    await expect(option(page, t.crypto)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(first).toBeFocused();
    await expect(first).toContainText(t.crypto);
  });

  test('«Усі» selects the empty value and the trigger shows it', async ({
    page,
  }) => {
    await openGallery(page);
    const trigger = field(page, t.allLabel);
    await expect(trigger).toContainText(t.all);
    await trigger.click();
    await option(page, t.crypto).click();
    await expect(trigger).toContainText(t.crypto);
    await trigger.click();
    await option(page, t.all).click();
    await expect(trigger).toContainText(t.all);
  });

  test('a long label is cut with an ellipsis in the field, kept in title and wrapped in the list', async ({
    page,
  }) => {
    await openGallery(page);
    const trigger = field(page, t.longLabel);
    await expect(trigger).toHaveAttribute('title', t.longOption);
    const overflow = await trigger.evaluate((node) => {
      const text = node.firstElementChild as HTMLElement;
      return {
        clipped: text.scrollWidth > text.clientWidth,
        style: getComputedStyle(text).textOverflow,
        lines: Math.round(
          text.getBoundingClientRect().height /
            parseFloat(getComputedStyle(text).lineHeight),
        ),
      };
    });
    expect(overflow).toEqual({ clipped: true, style: 'ellipsis', lines: 1 });
    await trigger.click();
    const long = option(page, t.longOption.slice(0, 20));
    await expect(long).toBeVisible();
    const lines = await long.evaluate((node) => {
      const text = node.querySelector('span.line-clamp-2') as HTMLElement;
      return Math.round(
        text.getBoundingClientRect().height /
          parseFloat(getComputedStyle(text).lineHeight),
      );
    });
    expect(lines).toBe(2);
  });

  test('the list stays inside a 320 px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openGallery(page);
    await field(page, t.narrowLabel).click();
    const box = await popup(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(8 - 0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320 - 8 + 0.5);
  });

  test('disabled and empty states', async ({ page }) => {
    await openGallery(page);
    await expect(field(page, t.disabledLabel)).toBeDisabled();
    await expect(field(page, t.invalidLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await field(page, t.emptyLabel).click();
    await expect(option(page, messages.common.selectEmpty)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('the open-from-keyboard helper shows the list without animation', async ({
    page,
  }) => {
    await openGallery(page);
    await section(page).getByRole('button', { name: t.openButton }).click();
    await expect(popup(page)).toBeVisible();
    expect(await animationName(popup(page))).toBe('none');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe is clean with the field closed (${theme})`, async ({
      page,
    }, testInfo) => {
      await openGallery(page, theme);
      await checkAccessibility(page, testInfo);
    });

    // Radix hides the page with aria-hidden while the list is open and traps focus; the popup has no overlay,
    // so axe cannot see the modal and reports the hidden-but-focusable page (false positive, no focus can reach it).
    test(`axe is clean with the list open (${theme})`, async ({ page }) => {
      await openGallery(page, theme);
      await field(page, t.selectedLabel).click();
      await expect(popup(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['aria-hidden-focus'])
        .analyze();
      expect(
        result.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    });
  }
});
