import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection, openGallery } from '../support/dev-ui';

const t = messages.devUi.combobox;

const section = (page: Page) => gallerySection(page, t.title);
const field = (page: Page, label: string) =>
  section(page).getByLabel(label, { exact: true });
const popup = (page: Page) => page.locator('[data-slot="combobox-content"]');
const options = (page: Page) => popup(page).getByRole('option');

test.describe('Combobox on touch [UI-F4]', () => {
  test('the input is 44 px high with 16 px text; a tap opens the list and a tap on an option picks it', async ({
    page,
  }) => {
    await openGallery(page);
    const input = field(page, t.duplicatesLabel);
    const style = await input.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      font: getComputedStyle(node).fontSize,
    }));
    expect(style).toEqual({ height: 44, font: '16px' });
    await input.tap();
    await expect(options(page).first()).toBeVisible();
    await expect(input).toBeFocused();
    const heights = await options(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    const font = await options(page)
      .first()
      .evaluate((node) => getComputedStyle(node).fontSize);
    expect(font).toBe('16px');
    await options(page).nth(1).tap();
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue(t.people.taras.name);
    await expect(input).toBeFocused();
  });

  test('the clear button is tappable and returns focus to the input', async ({
    page,
  }) => {
    await openGallery(page);
    const input = field(page, t.selectedLabel);
    await input.focus();
    const clear = input.locator('xpath=following-sibling::button');
    const box = await clear.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(36);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await clear.tap();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  });

  test('a list of 200 options is at most 60dvh high and scrolls inside', async ({
    page,
  }) => {
    await openGallery(page);
    await field(page, t.manyLabel).tap();
    await expect(options(page).first()).toBeVisible();
    const sizes = await popup(page).evaluate((node) => {
      const list = node.querySelector('[role="listbox"]') as HTMLElement;
      return {
        popup: node.getBoundingClientRect().height,
        scrolls: list.scrollHeight > list.clientHeight,
        viewport: window.innerHeight,
      };
    });
    expect(sizes.popup).toBeLessThanOrEqual(sizes.viewport * 0.6 + 0.5);
    expect(sizes.scrolls).toBe(true);
  });

  test('at 320 px the page does not scroll sideways and the open list neither widens the page nor leaves the window', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openGallery(page);
    const overflow = async () => ({
      page: await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      section: await section(page).evaluate(
        (node) => node.scrollWidth - node.clientWidth,
      ),
    });
    const before = await overflow();
    expect(before.page).toBeLessThanOrEqual(0);
    expect(before.section).toBeLessThanOrEqual(0);
    await field(page, t.longLabel).tap();
    await expect(popup(page)).toBeVisible();
    const box = await popup(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(8 - 0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320 - 8 + 0.5);
    expect(await overflow()).toEqual(before);
  });
});
