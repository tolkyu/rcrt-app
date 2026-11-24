import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, sep } from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import lighthouse from 'lighthouse';
import { E2E_ORIGIN, signInWithTotp } from '../support/e2e-session';
import {
  LIGHTHOUSE_ROUTES,
  lighthouseSummary,
  type LighthouseSample,
} from './lighthouse-budget';

const cacheRoot = resolve('.cache');
let context: BrowserContext;
let profile: string;
let port: number;
const measurements = new Map<string, unknown>();

async function removeProfile() {
  if (!profile) return;
  const target = resolve(profile);
  if (!target.startsWith(`${cacheRoot}${sep}`))
    throw new Error('Lighthouse profile is outside the local cache directory');
  await rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not reserve a loopback Lighthouse port');
  await new Promise<void>((done, fail) =>
    server.close((error) => (error ? fail(error) : done())),
  );
  return address.port;
}

test.beforeAll(async () => {
  if (process.env.VERCEL_ENV)
    throw new Error('Lighthouse runs only against the local demo stack');
  await mkdir(cacheRoot, { recursive: true });
  profile = await mkdtemp(resolve(cacheRoot, 'lighthouse-'));
  port = await availablePort();
  // The persistent default context shares its cookie jar with Lighthouse's CDP target.
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    baseURL: E2E_ORIGIN,
    args: [
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
    ],
  });
  await signInWithTotp(context.request, 'admin@demo');
});

test.afterAll(async () => {
  try {
    await context?.close();
  } finally {
    try {
      await mkdir('tests/perf/results/lighthouse', { recursive: true });
      await writeFile(
        'tests/perf/results/lighthouse/summary.json',
        `${JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            ...Object.fromEntries(measurements),
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      await removeProfile();
    }
  }
});

test.afterEach(async ({ browserName }, info) => {
  if (info.status === 'passed') return;
  await mkdir('tests/perf/results/lighthouse', { recursive: true });
  await writeFile(
    `tests/perf/results/lighthouse/${info.title.replace(/[^a-z0-9]+/gi, '-')}-error.json`,
    `${JSON.stringify(
      {
        browser: browserName,
        status: info.status,
        code: 'LIGHTHOUSE_GATE_FAILED',
      },
      null,
      2,
    )}\n`,
  );
});

for (const mobile of [false, true]) {
  const device = mobile ? 'mobile-4g' : 'desktop';
  for (const route of LIGHTHOUSE_ROUTES) {
    test(`${device} ${route} Lighthouse [STORY-FND-2, PERF-03]`, async () => {
      const session = await context.request.get('/api/v1/me');
      expect(
        session.status(),
        'Lighthouse requires an authenticated session',
      ).toBe(200);
      expect(
        ((await session.json()) as { mfaRequired: boolean }).mfaRequired,
      ).toBe(false);
      const samples: LighthouseSample[] = [];
      let lighthouseVersion = '';
      for (let run = 0; run < 3; run += 1) {
        // Preserve authentication while clearing HTTP cache for each cold navigation.
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.clearBrowserCache');
        await page.close();
        const result = await lighthouse(
          `${E2E_ORIGIN}${route}`,
          {
            port,
            logLevel: 'silent',
          },
          {
            extends: 'lighthouse:default',
            settings: {
              onlyAudits: [
                'largest-contentful-paint',
                'cumulative-layout-shift',
                'total-blocking-time',
              ],
              disableStorageReset: true,
              disableFullPageScreenshot: true,
              formFactor: mobile ? 'mobile' : 'desktop',
              emulatedUserAgent: false,
              screenEmulation: {
                mobile,
                width: mobile ? 390 : 1440,
                height: mobile ? 844 : 900,
                deviceScaleFactor: mobile ? 2.75 : 1,
                disabled: false,
              },
              throttlingMethod: 'devtools',
              throttling: {
                rttMs: mobile ? 150 : 0,
                throughputKbps: mobile ? 1638.4 : 0,
                requestLatencyMs: mobile ? 150 : 0,
                downloadThroughputKbps: mobile ? 1638.4 : 0,
                uploadThroughputKbps: mobile ? 750 : 0,
                cpuSlowdownMultiplier: mobile ? 4 : 1,
              },
            },
          },
        );
        expect(result, 'Lighthouse returned no result').toBeDefined();
        const lhr = result!.lhr;
        expect(
          lhr.runtimeError?.code,
          'Lighthouse runtime error',
        ).toBeUndefined();
        const finalUrl = new URL(lhr.finalDisplayedUrl);
        expect(finalUrl.origin).toBe(E2E_ORIGIN);
        expect(
          finalUrl.pathname,
          'Lighthouse must audit the protected screen',
        ).toBe(route);
        lighthouseVersion = lhr.lighthouseVersion;
        const metric = (id: string) => {
          const audit = lhr.audits[id];
          expect(audit, `Missing Lighthouse audit ${id}`).toBeDefined();
          expect(
            audit!.scoreDisplayMode,
            `Failed Lighthouse audit ${id}`,
          ).not.toBe('error');
          expect(
            typeof audit!.numericValue,
            `Missing numeric Lighthouse audit ${id}`,
          ).toBe('number');
          return audit!.numericValue!;
        };
        samples.push({
          lcp: metric('largest-contentful-paint'),
          cls: metric('cumulative-layout-shift'),
          tbt: metric('total-blocking-time'),
        });
      }
      const summary = lighthouseSummary(samples, mobile);
      const entry = { lighthouseVersion, samples, ...summary };
      const key = `${device}${route}`;
      measurements.set(key, entry);
      await mkdir('tests/perf/results/lighthouse', { recursive: true });
      // Numeric audit evidence only: full LHR files may contain cookie headers, screenshots or demo PII.
      await writeFile(
        `tests/perf/results/lighthouse/${key.replaceAll('/', '-')}.json`,
        `${JSON.stringify(entry, null, 2)}\n`,
      );
      expect
        .soft(summary.lcp, `${key} median Lighthouse LCP`)
        .toBeLessThan(summary.budgets.lcp);
      expect
        .soft(summary.cls, `${key} median Lighthouse CLS`)
        .toBeLessThan(summary.budgets.cls);
    });
  }
}
