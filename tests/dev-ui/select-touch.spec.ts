import { expect, test } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection, openGallery } from '../support/dev-ui';

const t = messages.devUi.select;

test.describe('Select on touch [UI-F3]', () => {
  test('a tap opens the list, targets are 44 px and text is 16 px', async ({
    page,
  }) => {
    await openGallery(page);
    const trigger = gallerySection(page, t.title).getByLabel(t.selectedLabel, {
      exact: true,
    });
    const style = await trigger.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      font: getComputedStyle(node).fontSize,
    }));
    expect(style).toEqual({ height: 44, font: '16px' });
    await trigger.tap();
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    const box = await options.first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await options.nth(1).tap();
    await expect(options).toHaveCount(0);
    await expect(trigger).toBeVisible();
  });
});
