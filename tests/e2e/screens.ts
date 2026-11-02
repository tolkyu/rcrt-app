import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** A page-tall viewport places fixed bars at the image edge instead of halfway through a full-page capture. */
export async function captureScreen(
  page: Page,
  testInfo: TestInfo,
  file: string,
) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  const noHorizontalOverflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  expect(await noHorizontalOverflow()).toBe(true);
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(() => {
    let needed = document.documentElement.scrollHeight;
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]',
    )) {
      if (
        element.getClientRects().length === 0 ||
        element.scrollHeight <= element.clientHeight
      )
        continue;
      const maxHeight = Number.parseFloat(getComputedStyle(element).maxHeight);
      const ratio =
        Number.isFinite(maxHeight) && maxHeight > 0
          ? Math.min(1, maxHeight / window.innerHeight)
          : 1;
      const intrinsic =
        element.scrollHeight + element.offsetHeight - element.clientHeight;
      needed = Math.max(needed, Math.ceil(intrinsic / ratio));
    }
    return needed;
  });
  const path = `screenshots/phase-1/${file}`;
  mkdirSync('screenshots/phase-1', { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  try {
    await page.setViewportSize({
      width: viewport.width,
      height: Math.max(viewport.height, height),
    });
    expect(await noHorizontalOverflow()).toBe(true);
    await page.screenshot({ path, animations: 'disabled', scale: 'css' });
  } finally {
    await page.setViewportSize(viewport);
  }
  copyFileSync(path, `screenshots/latest/${file}`);
  await testInfo.attach(file, { path, contentType: 'image/png' });
}
