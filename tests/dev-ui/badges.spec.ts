import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection, openGallery } from '../support/dev-ui';
import { checkAccessibility } from '../support/accessibility';

const t = messages.devUi.badges;
const section = (page: Page) => gallerySection(page, t.title);
const chips = (page: Page) => section(page).locator('[data-slot="badge"]');
const chip = (page: Page, text: string) =>
  chips(page).filter({ hasText: new RegExp(`^${text}$`) });

const style = (element: Locator, property: string) =>
  element.evaluate(
    (node, name) => getComputedStyle(node).getPropertyValue(name),
    property,
  );

test.describe('Badge [UI-F2]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('every chip renders text, never wraps and stays on one line', async ({
    page,
  }) => {
    const all = await chips(page).evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent?.trim() ?? '',
        whiteSpace: getComputedStyle(node).whiteSpace,
        height: node.getBoundingClientRect().height,
        shrink: getComputedStyle(node).flexShrink,
      })),
    );
    expect(all.length).toBeGreaterThanOrEqual(15);
    expect(all.filter((badge) => badge.text === '')).toEqual([]);
    expect(all.filter((badge) => badge.whiteSpace !== 'nowrap')).toEqual([]);
    expect(all.filter((badge) => badge.height > 28)).toEqual([]);
    expect(all.filter((badge) => badge.shrink !== '0')).toEqual([]);
  });

  test('chips are pills', async ({ page }) => {
    const radii = await chips(page).evaluateAll((nodes) =>
      nodes.map((node) =>
        parseFloat(getComputedStyle(node).borderTopLeftRadius),
      ),
    );
    expect(radii.filter((radius) => radius < 9999 / 2)).toEqual([]);
  });

  test('the draft chip has a dashed border, the others a solid or no style', async ({
    page,
  }) => {
    const draft = chip(page, t.draft);
    await expect(draft).toHaveCount(1);
    for (const side of ['Top', 'Right', 'Bottom', 'Left'])
      expect(await style(draft, `border-${side.toLowerCase()}-style`)).toBe(
        'dashed',
      );
    expect(await style(chip(page, t.open), 'border-top-style')).toBe('solid');
  });

  test('a long tag is clamped to one line with the full text in title', async ({
    page,
  }) => {
    const tag = chips(page).filter({ hasText: t.longTag });
    await expect(tag).toHaveAttribute('title', t.longTag);
    const label = tag.locator('span.truncate');
    const metrics = await label.evaluate((node) => ({
      overflow: getComputedStyle(node).textOverflow,
      clipped: node.scrollWidth > node.clientWidth,
    }));
    expect(metrics).toEqual({ overflow: 'ellipsis', clipped: true });
    const box = await tag.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(192.5);
  });

  test('short tags keep their text and carry the same title', async ({
    page,
  }) => {
    const short = chips(page).filter({ hasText: /^facebook$/ });
    await expect(short).toHaveAttribute('title', 'facebook');
    expect(
      await short
        .locator('span.truncate')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  });

  test('the urgent chip has a flame and the bot chip a bot icon, both with their text', async ({
    page,
  }) => {
    const urgent = chip(page, t.urgent).first();
    await expect(urgent.locator('svg.lucide-flame')).toHaveCount(1);
    await expect(urgent.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    const bot = chip(page, t.fromBot).first();
    await expect(bot.locator('svg.lucide-bot')).toHaveCount(1);
    expect(await style(bot, 'background-color')).toBe('rgba(0, 0, 0, 0)');
    expect(await style(bot, 'border-top-style')).toBe('solid');
    expect(await style(bot, 'border-top-width')).toBe('1px');
  });

  test('all chips of one title wrap between chips, never inside one', async ({
    page,
  }) => {
    const group = section(page).getByLabel(t.oneTitle);
    const inner = group.locator('[data-slot="badge"]');
    const heights = await inner.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
    expect(heights).toHaveLength(3);
    expect(heights.filter((height) => height > 28)).toEqual([]);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`the gallery passes axe in the ${theme} theme [UI-F2]`, async ({
    page,
  }, testInfo) => {
    await openGallery(page, theme);
    await expect(page.locator('html')).toHaveClass(
      theme === 'dark' ? 'dark' : /^$|light/,
    );
    await checkAccessibility(page, testInfo);
  });
}
