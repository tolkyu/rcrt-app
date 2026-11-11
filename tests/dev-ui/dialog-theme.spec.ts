import { expect, test, type Page } from '@playwright/test';
import { openGallery } from '../support/dev-ui';
import { open, t } from '../support/dialog';
import messages from '../../messages/uk.json' with { type: 'json' };

const form = messages.devUi.form;

/** The app themes by class on <html> (none = the OS), so `dark:` styles must follow that and not the OS alone. */
const CASES = [
  { scheme: 'light', theme: 'light', dark: false },
  { scheme: 'dark', theme: 'light', dark: false },
  { scheme: 'light', theme: 'dark', dark: true },
  { scheme: 'dark', theme: 'dark', dark: true },
  { scheme: 'light', theme: 'system', dark: false },
  { scheme: 'dark', theme: 'system', dark: true },
] as const;

const alphaOf = (color: string) => {
  const match = /(?:\/\s*|,\s*)([\d.]+)\)$/.exec(color);
  return match ? Number(match[1]) : 1;
};

/** Resolves a token (light-dark() included) to the colour it paints now. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

for (const { scheme, theme, dark } of CASES) {
  test.describe(`OS ${scheme}, app theme ${theme} [UI-F8, BUG-F8-2]`, () => {
    test.use({ colorScheme: scheme });

    test(`the scrim is ${dark ? '60' : '40'}% black`, async ({ page }) => {
      await openGallery(page, theme);
      await open(page, t.sizes, t.sizeLabel.sm).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const scrim = await page
        .locator('.motion-fade.z-dialog')
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(alphaOf(scrim)).toBeCloseTo(dark ? 0.6 : 0.4, 2);
    });

    test(`a selected segmented option is ${dark ? 'primary-subtle' : 'surface'}`, async ({
      page,
    }) => {
      await openGallery(page, theme);
      const selected = page
        .getByRole('radiogroup', { name: form.priorityLabel })
        .getByRole('radio', { checked: true })
        .first();
      await expect(selected).toBeVisible();
      expect(
        await selected.evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        ),
      ).toBe(await tokenColour(page, dark ? '--primary-subtle' : '--surface'));
    });
  });
}
