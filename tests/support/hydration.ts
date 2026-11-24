import type { Page } from '@playwright/test';

/** Controlled inputs ignore events dispatched before React has hydrated the page. */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const element = document.querySelector(
      'main input, main select, main button',
    );
    return (
      element !== null &&
      Object.keys(element).some((key) => key.startsWith('__reactProps$'))
    );
  });
}

export async function openHydrated(page: Page, path: string) {
  const response = await page.goto(path);
  await waitForHydration(page);
  return response;
}
