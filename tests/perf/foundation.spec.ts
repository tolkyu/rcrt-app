import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import messages from '../../messages/uk.json' with { type: 'json' };
import {
  E2E_ORIGIN,
  MUTATION_HEADERS,
  signInWithTotp,
} from '../support/e2e-session';

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
let state: State;
const results = new Map<string, unknown>();
const routes = [
  ['/profile', messages.profile.title],
  ['/settings/users', messages.settings.users.title],
  ['/settings/verticals', messages.settings.verticals.title],
  ['/settings/priorities', messages.settings.priorities.title],
  ['/settings/audit', messages.settings.audit.title],
] as const;
const percentile = (values: number[], percentile: number) =>
  [...values].sort((a, b) => a - b)[
    Math.ceil((values.length * percentile) / 100) - 1
  ]!;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: E2E_ORIGIN });
  try {
    await signInWithTotp(context.request, 'admin@demo');
    state = await context.storageState();
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  await mkdir('tests/perf/results', { recursive: true });
  await writeFile(
    'tests/perf/results/foundation.json',
    `${JSON.stringify({ measuredAt: new Date().toISOString(), ...Object.fromEntries(results) }, null, 2)}\n`,
  );
});

test.afterEach(async ({ browserName }, info) => {
  await mkdir('tests/perf/results', { recursive: true });
  const name = info.title.replace(/[^a-z0-9]+/gi, '-');
  await writeFile(
    `tests/perf/results/${name}.json`,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        status: info.status,
        browser: browserName,
        ...Object.fromEntries(results),
      },
      null,
      2,
    )}\n`,
  );
});

test('real authenticated API server P95 [PERF-02]', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: E2E_ORIGIN,
    storageState: state,
  });
  try {
    const meResponse = await context.request.get('/api/v1/me');
    expect(meResponse.status()).toBe(200);
    const me = (await meResponse.json()) as {
      user: { id: string; fullName: string };
    };
    const verticalResponse = await context.request.get(
      '/api/v1/settings/verticals',
    );
    expect(verticalResponse.status()).toBe(200);
    const verticals = (await verticalResponse.json()) as {
      items: { id: string }[];
    };
    const verticalId = verticals.items[0]!.id;
    const paths = [
      ['/api/v1/users?limit=50', 150],
      ['/api/v1/audit?limit=50', 150],
      ['/api/v1/settings/verticals', 150],
      ['/api/v1/settings/priorities/verticals', 150],
      [`/api/v1/verticals/${verticalId}/team-lead-priorities`, 150],
      ['/api/v1/auth/sessions', 150],
      ['/api/v1/me', 100],
      [`/api/v1/users/${me.user.id}`, 100],
    ] as const;
    const measurements: Record<string, { p95: number; budget: number }> = {};
    for (const [path, budget] of paths) {
      const samples: number[] = [];
      for (let run = 0; run < 45; run += 1) {
        const responses = await Promise.all(
          Array.from({ length: 4 }, () => context.request.get(path)),
        );
        for (const response of responses) {
          expect(response.status()).toBe(200);
          const timing = response.headers()['server-timing'];
          expect(timing).toMatch(/app;dur=[\d.]+/);
          const duration = Number(/app;dur=([\d.]+)/.exec(timing!)![1]);
          if (run >= 5) samples.push(duration);
        }
      }
      measurements[
        path.replace(me.user.id, '{id}').replace(verticalId, '{verticalId}')
      ] = {
        p95: percentile(samples, 95),
        budget,
      };
      expect.soft(percentile(samples, 95), path).toBeLessThan(budget);
    }
    const samples: number[] = [];
    const update = (fullName: string) =>
      context.request.patch('/api/v1/me', {
        headers: MUTATION_HEADERS,
        data: { fullName },
      });
    try {
      for (let run = 0; run < 25; run += 1) {
        const response = await update(`${me.user.fullName} · швидкодія`);
        expect(response.status()).toBe(200);
        const timing = response.headers()['server-timing'];
        expect(timing).toMatch(/app;dur=[\d.]+/);
        if (run >= 5)
          samples.push(Number(/app;dur=([\d.]+)/.exec(timing!)![1]));
        expect((await update(me.user.fullName)).status()).toBe(200);
      }
    } finally {
      expect((await update(me.user.fullName)).status()).toBe(200);
    }
    measurements['PATCH /api/v1/me'] = {
      p95: percentile(samples, 95),
      budget: 120,
    };
    results.set('api', measurements);
    expect
      .soft(percentile(samples, 95), 'real profile write')
      .toBeLessThan(120);
  } finally {
    await context.close();
  }
});

async function observe(page: Page) {
  await page.addInitScript(() => {
    const data = { lcp: 0, cls: 0, interactions: [] as number[] };
    Object.defineProperty(window, '__foundationVitals', { value: data });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) data.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    let sessionStart = 0;
    let sessionEnd = 0;
    let sessionValue = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (shift.hadRecentInput) continue;
        if (
          shift.startTime - sessionEnd > 1000 ||
          shift.startTime - sessionStart > 5000
        ) {
          sessionStart = shift.startTime;
          sessionValue = 0;
        }
        sessionEnd = shift.startTime;
        sessionValue += shift.value;
        data.cls = Math.max(data.cls, sessionValue);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          (entry as PerformanceEntry & { interactionId: number }).interactionId
        )
          data.interactions.push(entry.duration);
      }
    }).observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit & { durationThreshold: number });
  });
}

for (const mobile of [false, true]) {
  const device = mobile ? 'mobile-4g' : 'desktop';
  test(`${device} production rendering and interaction [PERF-03, C06]`, async ({
    browser,
  }) => {
    const measurements: Record<string, unknown> = {};
    for (const [path, heading] of routes) {
      const samples: {
        lcp: number;
        cls: number;
        interaction: number;
        dom: number;
      }[] = [];
      for (let run = 0; run < 3; run += 1) {
        const context = await browser.newContext({
          baseURL: E2E_ORIGIN,
          storageState: state,
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1440, height: 900 },
          isMobile: mobile,
          deviceScaleFactor: mobile ? 2.75 : 1,
          hasTouch: mobile,
        });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          if (mobile) {
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', {
              offline: false,
              latency: 150,
              downloadThroughput: (1.6 * 1024 * 1024) / 8,
              uploadThroughput: (750 * 1024) / 8,
              connectionType: 'cellular4g',
            });
          }
          await observe(page);
          await page.goto(path);
          await expect(
            page.getByRole('heading', { name: heading, exact: true }).first(),
          ).toBeVisible();
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => document.fonts.ready);
          // Trusted input finalizes LCP; the lazy menu and theme repaint are real interactions on every screen.
          await page.getByRole('button', { name: /^Тема оформлення:/ }).click();
          await page
            .getByRole('menuitemradio', {
              name: messages.theme.dark,
              exact: true,
            })
            .click();
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              ),
          );
          const measured = await page.evaluate(() => {
            const data = (
              window as unknown as {
                __foundationVitals: {
                  lcp: number;
                  cls: number;
                  interactions: number[];
                };
              }
            ).__foundationVitals;
            return {
              lcp: data.lcp,
              cls: data.cls,
              interaction: Math.max(0, ...data.interactions),
              dom: document.querySelectorAll('*').length,
            };
          });
          samples.push(measured);
          expect
            .soft(measured.lcp, `${path} valid LCP sample`)
            .toBeGreaterThan(0);
        } finally {
          await context.close();
        }
      }
      const medianLcp = percentile(
        samples.map((sample) => sample.lcp),
        50,
      );
      const maxCls = Math.max(...samples.map((sample) => sample.cls));
      const interaction = Math.max(
        ...samples.map((sample) => sample.interaction),
      );
      measurements[path] = { samples, medianLcp, maxCls, interaction };
      expect.soft(medianLcp, `${path} LCP`).toBeLessThan(mobile ? 2500 : 1200);
      expect.soft(maxCls, `${path} CLS`).toBeLessThan(mobile ? 0.1 : 0.05);
      expect
        .soft(interaction, `${path} lab interaction max`)
        .toBeLessThan(mobile ? 200 : 100);
    }
    results.set(device, measurements);
  });

  test(`${device} bounded audit rendering and warm navigation [PERF-03, C06]`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: E2E_ORIGIN,
      storageState: state,
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await observe(page);
      await page.goto('/settings/audit');
      await expect(page.locator('[data-audit-row]:visible')).toHaveCount(50);
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('button', {
          name: messages.settings.audit.loadMore,
          exact: true,
        })
        .click();
      await expect(page.locator('[data-audit-row]:visible')).toHaveCount(100);
      expect(await page.locator('[data-audit-row]').count()).toBe(100);
      const dom = await page.locator('*').count();
      await page.locator('[data-row-open]:visible').last().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const interaction = await page.evaluate(() =>
        Math.max(
          0,
          ...(
            window as unknown as {
              __foundationVitals: { interactions: number[] };
            }
          ).__foundationVitals.interactions,
        ),
      );
      expect
        .soft(interaction, '100-row audit interaction max')
        .toBeLessThan(mobile ? 200 : 100);
      results.set(`${device}-bounded-audit`, {
        retainedRows: 100,
        domRows: 100,
        dom,
        interaction,
      });
      const durations: number[] = [];
      for (let run = 0; run < 12; run += 1) {
        const [path, title] = routes[run % 2 === 0 ? 2 : 1]!;
        const link = page.locator(`nav a[href="${path}"]:visible`).first();
        await link.scrollIntoViewIfNeeded();
        await link.hover();
        await page.waitForLoadState('networkidle');
        await page.evaluate((heading) => {
          const navigation = { start: 0, duration: -1 };
          Object.defineProperty(window, '__foundationNavigation', {
            value: navigation,
            configurable: true,
          });
          document.addEventListener(
            'click',
            () => {
              navigation.start = performance.now();
            },
            { capture: true, once: true },
          );
          const observer = new MutationObserver(() => {
            if (
              ![...document.querySelectorAll('h1')].some(
                (element) => element.textContent === heading,
              )
            )
              return;
            observer.disconnect();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                navigation.duration = performance.now() - navigation.start;
              }),
            );
          });
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
          });
        }, title);
        await link.click();
        await page.waitForFunction(
          () =>
            (
              window as unknown as {
                __foundationNavigation: { duration: number };
              }
            ).__foundationNavigation.duration >= 0,
        );
        const duration = await page.evaluate(
          () =>
            (
              window as unknown as {
                __foundationNavigation: { duration: number };
              }
            ).__foundationNavigation.duration,
        );
        if (run >= 2) durations.push(duration);
      }
      const p95 = percentile(durations, 95);
      results.set(`${device}-warm-navigation`, {
        samples: durations,
        p95,
        budget: 200,
      });
      expect.soft(p95, 'warm settings navigation P95').toBeLessThan(200);
    } finally {
      await context.close();
    }
  });
}
