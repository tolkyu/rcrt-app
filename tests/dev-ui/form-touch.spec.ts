import { expect, test, type Locator, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import { gallerySection, openGallery } from '../support/dev-ui';

const t = messages.devUi.form;

const section = (page: Page) => gallerySection(page, t.title);
const form = (page: Page) => section(page).locator('form');

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no box');
  return rect;
};

/** The 20 px box owns a 44 px hit area through a pseudo-element, so points 21.5 px off-centre (inside 44, outside 42) must still resolve to it. */
const hitsControl = (control: Locator, dx: number, dy: number) =>
  control.evaluate(
    (node, { x: offsetX, y: offsetY }) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2 + offsetX,
        rect.top + rect.height / 2 + offsetY,
      );
      return hit === node;
    },
    { x: dx, y: dy },
  );

const OFFSETS: [number, number][] = [
  [-21.5, 0],
  [21.5, 0],
  [0, -21.5],
  [0, 21.5],
];

test.describe('Form kit on touch [UI-F5]', () => {
  test.beforeEach(async ({ page }) => {
    await openGallery(page);
  });

  test('text fields are 16 px (no iOS zoom) and at least 44 px tall', async ({
    page,
  }) => {
    for (const selector of ['#form-rhf-title', '#form-rhf-reason']) {
      const style = await form(page)
        .locator(selector)
        .evaluate((node) => ({
          font: getComputedStyle(node).fontSize,
          height: node.getBoundingClientRect().height,
        }));
      expect(style.font).toBe('16px');
      expect(style.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the textarea keeps 3 rows at 390 px and grows with content', async ({
    page,
  }) => {
    const reason = form(page).locator('#form-rhf-reason');
    const before = (await box(reason)).height;
    expect(before).toBeCloseTo(3 * 24 + 26, 0);
    await reason.fill(Array.from({ length: 8 }, () => 'рядок').join('\n'));
    expect((await box(reason)).height).toBeGreaterThan(before + 60);
  });

  test('checkbox and radio hit areas are 44 px: points 21.5 px off-centre resolve to the control', async ({
    page,
  }) => {
    const controls = [
      form(page).locator('#form-rhf-consent'),
      page.getByRole('radio', { name: t.channelEmail, exact: true }),
      page.getByRole('radio', { name: t.channelPhone, exact: true }),
    ];
    for (const control of controls) {
      await control.scrollIntoViewIfNeeded();
      expect((await box(control)).height).toBe(20);
      for (const [dx, dy] of OFFSETS)
        expect(await hitsControl(control, dx, dy)).toBe(true);
    }
  });

  test('a tap in the margin of the checkbox hit area toggles it', async ({
    page,
  }) => {
    const consent = form(page).locator('#form-rhf-consent');
    await consent.scrollIntoViewIfNeeded();
    const rect = await box(consent);
    await page.touchscreen.tap(rect.x + 10, rect.y + 10 - 20);
    await expect(consent).toHaveAttribute('aria-checked', 'true');
    await page.touchscreen.tap(rect.x + 10 - 20, rect.y + 10);
    await expect(consent).toHaveAttribute('aria-checked', 'false');
  });

  test('label rows of checkbox and radio are at least 44 px tall and a label tap works', async ({
    page,
  }) => {
    const consentRow = form(page)
      .locator('label[for="form-rhf-consent"]')
      .locator('xpath=..');
    expect((await box(consentRow)).height).toBeGreaterThanOrEqual(44);
    const phone = page.getByRole('radio', {
      name: t.channelPhone,
      exact: true,
    });
    expect(
      (await box(phone.locator('xpath=..'))).height,
    ).toBeGreaterThanOrEqual(44);
    await page.getByText(t.channelPhone, { exact: true }).tap();
    await expect(phone).toHaveAttribute('aria-checked', 'true');
  });

  test('segmented items are at least 44 px high and wide and a tap selects', async ({
    page,
  }) => {
    for (const name of [t.priorityNormal, t.priorityUrgent]) {
      const item = form(page).getByRole('radio', { name, exact: true });
      const rect = await box(item);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.width).toBeGreaterThanOrEqual(44);
    }
    const urgent = form(page).getByRole('radio', {
      name: t.priorityUrgent,
      exact: true,
    });
    await urgent.tap();
    await expect(urgent).toHaveAttribute('aria-checked', 'true');
  });

  test('the form has no horizontal overflow at 390 px', async ({ page }) => {
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a failed submit by tap shows the summary and focuses the first invalid field', async ({
    page,
  }) => {
    await form(page).getByRole('button', { name: t.submit, exact: true }).tap();
    await expect(form(page).getByRole('alert')).toHaveText('Виправте 3 поля');
    await expect(form(page).locator('#form-rhf-title')).toBeFocused();
  });
});
