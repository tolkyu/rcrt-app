import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { E2E_ORIGIN } from '../support/origins';

/** Phone projects end in `mobile` (`e2e-mobile`, `e2e-admin-mobile`); the file name's viewport token follows it. */
export const viewportOf = (testInfo: TestInfo) =>
  testInfo.project.name.endsWith('mobile') ? 'mobile' : 'desktop';

/**
 * Prefetched queries stay fresh for 30 s by the browser clock, and the fixed clock is earlier than the server's real
 * time once the suite runs after it, so the mocked API would never be asked and the live rows would be shown. Marking
 * the hydrated queries invalidated makes the browser refetch them on mount whatever day the suite runs.
 */
export async function installFixedClock(
  page: Page,
  masks: readonly (readonly [real: string, fixed: string])[] = [],
) {
  const mask = (body: string) =>
    masks.reduce((text, [real, fixed]) => text.replaceAll(real, fixed), body);
  await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
  await page.route(
    (url) => !url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const flight = (await request.headerValue('rsc')) !== null;
      if (request.resourceType() !== 'document' && !flight) {
        await route.fallback();
        return;
      }
      try {
        const response = await route.fetch().catch((error: unknown) => {
          // A kept-alive socket the server closes as it is reused resets once; a GET is safe to send again, a second reset is real.
          if (request.method() !== 'GET' || !/ECONNRESET/.test(String(error)))
            throw error;
          return route.fetch();
        });
        const body = mask(
          (await response.text()).replace(
            /(isInvalidated\\?":)false/g,
            '$1true',
          ),
        );
        await route.fulfill({ response, body });
      } catch (error) {
        // A reload, a navigation or the end of the test that supersedes the request cancels it mid-flight.
        if (!/disposed|already handled|closed|Test ended/i.test(String(error)))
          throw error;
      }
    },
  );
  /** A row a spec inserts gets the next identity number, which differs per database; the capture shows a fixed one. */
  if (masks.length)
    await page.route(
      (url) => url.pathname.startsWith('/api/v1/vacancies'),
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: mask(await response.text()) });
      },
    );
}

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
 * `keepFocus` leaves the pointer and focus where the test put them, for a tooltip that exists only while its trigger is hovered or focused.
 */
export async function captureScreen(
  page: Page,
  testInfo: TestInfo,
  file: string,
  phase: 'phase-1' | 'phase-2' = 'phase-1',
  {
    deviceViewport = false,
    keepFocus = false,
  }: { deviceViewport?: boolean; keepFocus?: boolean } = {},
) {
  if (!keepFocus) await page.mouse.move(0, 0);
  // The ring left by the last click or Escape is not part of the screen (UX-G-11); text fields keep focus, blurring them would validate.
  const blurred = keepFocus
    ? null
    : await page.evaluateHandle(() => {
        const active = document.activeElement;
        const typing =
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable) ||
          (active instanceof HTMLInputElement &&
            !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(
              active.type,
            ));
        if (
          !(active instanceof HTMLElement) ||
          active === document.body ||
          typing
        )
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
    await blurred?.evaluate((element) =>
      element?.focus({ preventScroll: true }),
    );
    await blurred?.dispose();
  }
  copyFileSync(path, `screenshots/latest/${file}`);
  await testInfo.attach(file, { path, contentType: 'image/png' });
}
