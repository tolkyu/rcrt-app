import type { Page } from '@playwright/test';

/**
 * Fails every script chunk that carries zod, the way a dropped connection would. Matching on content keeps the
 * helper independent of the hashed chunk names, and installing it before navigation beats the idle warm-up.
 * Returns the URLs that were refused.
 */
export async function blockValidationChunks(page: Page) {
  const blocked: string[] = [];
  await page.route('**/_next/static/chunks/**', async (route) => {
    const response = await route.fetch();
    if ((await response.text()).includes('ZodError')) {
      blocked.push(route.request().url());
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response });
  });
  return blocked;
}
