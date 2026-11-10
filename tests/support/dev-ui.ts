import type { Locator, Page } from '@playwright/test';
import { DEV_UI_ORIGIN } from './origins';

/** Streamed Suspense boundaries swap their DOM in after the first button hydrates; interacting earlier loses focus and state. */
const allHydrated = () =>
  document.querySelector('template[id^="B:"]') === null &&
  [...document.querySelectorAll('main button')].every((button) =>
    Object.keys(button).some((key) => key.startsWith('__reactProps$')),
  );

export async function openGallery(
  page: Page,
  theme: 'light' | 'dark' = 'light',
) {
  await page
    .context()
    .addCookies([{ name: 'theme', value: theme, url: DEV_UI_ORIGIN }]);
  await page.goto('/dev/ui');
  await page.waitForFunction(allHydrated);
}

export const gallerySection = (page: Page, title: string) =>
  page.getByRole('region', { name: title, exact: true });

/** A click on a heading moves Chromium's sequential-focus start point there, so the next Tab lands on the first control below it. */
export async function tabAfter(page: Page, heading: Locator) {
  await heading.click();
  await page.keyboard.press('Tab');
}

export const tabIntoSection = (page: Page, section: Locator) =>
  tabAfter(page, section.getByRole('heading', { level: 2 }));

export const settleFrames = (page: Page, frames = 3) =>
  page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1)
      await new Promise((resolve) => requestAnimationFrame(resolve));
  }, frames);
