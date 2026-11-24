import { expect, test, type Page } from '@playwright/test';
import { openHydrated } from '../support/hydration';

const label = (page: Page) => page.locator('label[for="login-email"]');
const control = (page: Page) => page.locator('#login-email');
const selectedText = (page: Page) =>
  page.evaluate(() => window.getSelection()?.toString() ?? '');

test.describe('native Label [PERF-04, UI-F1]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a click focuses the control', async ({ page }) => {
    await openHydrated(page, '/login');
    await expect(control(page)).not.toBeFocused();
    await label(page).click();
    await expect(control(page)).toBeFocused();
  });

  test('a double click does not select the label text', async ({ page }) => {
    await openHydrated(page, '/login');
    await label(page).dblclick();
    await expect(control(page)).toBeFocused();
    expect(await selectedText(page)).toBe('');
  });

  test('a disabled control keeps its styling and takes no focus from the label', async ({
    page,
  }) => {
    await openHydrated(page, '/login');
    const look = () =>
      control(page).evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      });
    const enabled = await look();
    const labelColor = await label(page).evaluate(
      (element) => getComputedStyle(element).color,
    );
    await control(page).evaluate((element) => {
      (element as HTMLInputElement).disabled = true;
    });
    await expect(control(page)).toBeDisabled();
    await expect.poll(look).not.toEqual(enabled);
    expect((await look()).background).not.toBe(enabled.background);
    // Playwright's click waits for the label's control to be enabled, so a real pointer press is the only way to hit it.
    const box = (await label(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(control(page)).not.toBeFocused();
    expect(
      await label(page).evaluate((element) => getComputedStyle(element).color),
    ).toBe(labelColor);
  });
});
