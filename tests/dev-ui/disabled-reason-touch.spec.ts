import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection, openGallery } from '../support/dev-ui';

const t = messages.devUi.tooltip;
const section = (page: Page) => gallerySection(page, t.title);
const action = (page: Page, name: string) =>
  section(page).getByRole('button', { name, exact: true });
const reason = (page: Page, text: string) =>
  section(page).getByText(text, { exact: true });

test.describe('DisabledReason on a touch device [UI-F2]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('the device reports no hover', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(
      true,
    );
  });

  for (const [name, text] of [
    [t.publish, t.publishReason],
    [t.save, t.limitReason],
  ] as const) {
    test(`the reason of «${name}» is visible helper text under the button`, async ({
      page,
    }) => {
      const helper = reason(page, text);
      await expect(helper).toBeVisible();
      const [button, note] = await Promise.all([
        action(page, name).boundingBox(),
        helper.boundingBox(),
      ]);
      expect(note!.width).toBeGreaterThan(40);
      expect(note!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
      expect(
        await helper.evaluate((node) => getComputedStyle(node).fontSize),
      ).toBe('12px');
    });
  }

  test('tapping a disabled action does nothing and shows no tooltip', async ({
    page,
  }) => {
    await action(page, t.publish).tap({ force: true });
    await action(page, t.save).tap({ force: true });
    await expect(page.locator('output')).toContainText(`${t.attempts} 0`);
    await expect(
      page.locator('[data-radix-popper-content-wrapper]'),
    ).toHaveCount(0);
  });

  test('an available action shows no helper text and reacts to a tap', async ({
    page,
  }) => {
    await expect(reason(page, t.publishReason)).toHaveCount(1);
    await action(page, t.available).tap();
    await expect(page.locator('output')).toContainText(`${t.attempts} 1`);
  });
});
