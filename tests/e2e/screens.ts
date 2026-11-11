import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { E2E_ORIGIN } from '../support/origins';

/** Phone projects end in `mobile` (`e2e-mobile`, `e2e-admin-mobile`); the file name's viewport token follows it. */
export const viewportOf = (testInfo: TestInfo) =>
  testInfo.project.name.endsWith('mobile') ? 'mobile' : 'desktop';

/** Runs `step` once per theme with the server-rendered theme cookie set (SHOT-01..03). */
export async function forEachTheme(
  page: Page,
  step: (theme: 'light' | 'dark') => Promise<void>,
) {
  for (const theme of ['light', 'dark'] as const) {
    await page
      .context()
      .addCookies([{ name: 'theme', value: theme, url: E2E_ORIGIN }]);
    await step(theme);
  }
}

/** Captures taken while a state-change colour transition is still running differ from run to run (SHOT-DET-01). */
export async function settleRendering(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === 'running' &&
              Number.isFinite(animation.effect?.getComputedTiming().endTime),
          )
          .map((animation) => animation.finished),
      ),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  });
}

/**
 * A page-tall viewport places fixed bars at the image edge instead of halfway through a full-page capture.
 * `deviceViewport` keeps the real screen for states where a fixed layer must be shown against pinned sticky bars (toasts).
 */
export async function captureScreen(
  page: Page,
  testInfo: TestInfo,
  file: string,
  phase: 'phase-1' | 'phase-2' = 'phase-1',
  { deviceViewport = false }: { deviceViewport?: boolean } = {},
) {
  await page.mouse.move(0, 0);
  // The ring left by the last click or Escape is not part of the screen (UX-G-11); text fields keep focus, blurring them would validate.
  const blurred = await page.evaluateHandle(() => {
    const active = document.activeElement;
    const typing =
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable) ||
      (active instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(
          active.type,
        ));
    if (!(active instanceof HTMLElement) || active === document.body || typing)
      return null;
    active.blur();
    return active;
  });
  await settleRendering(page);
  const noHorizontalOverflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  expect(await noHorizontalOverflow()).toBe(true);
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(() => {
    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    let needed = dialogs.length
      ? window.innerHeight
      : document.documentElement.scrollHeight;
    for (const element of dialogs) {
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
  const path = `screenshots/${phase}/${file}`;
  mkdirSync(`screenshots/${phase}`, { recursive: true });
  mkdirSync('screenshots/latest', { recursive: true });
  try {
    await page.setViewportSize({
      width: viewport.width,
      height: deviceViewport
        ? viewport.height
        : Math.max(viewport.height, height),
    });
    expect(await noHorizontalOverflow()).toBe(true);
    await settleRendering(page);
    await page.screenshot({ path, animations: 'disabled', scale: 'css' });
  } finally {
    await page.setViewportSize(viewport);
    await blurred.evaluate((element) =>
      element?.focus({ preventScroll: true }),
    );
    await blurred.dispose();
  }
  copyFileSync(path, `screenshots/latest/${file}`);
  await testInfo.attach(file, { path, contentType: 'image/png' });
}
