import { defineConfig, devices } from '@playwright/test';
import { DEV_UI_ORIGIN } from './tests/support/origins';

export default defineConfig({
  testDir: './tests/dev-ui',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  expect: { timeout: 15_000 },
  use: {
    baseURL: DEV_UI_ORIGIN,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--disable-partial-raster'] },
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --turbopack --port ${new URL(DEV_UI_ORIGIN).port}`,
    url: `${DEV_UI_ORIGIN}/dev/ui`,
    reuseExistingServer: !process.env.CI,
    env: {
      APP_ENV: 'local',
      APP_URL: DEV_UI_ORIGIN,
      NEXT_DIST_DIR: '.next-dev',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    timeout: 120_000,
  },
  projects: [
    {
      name: 'dev-ui-desktop',
      testIgnore: '**/*-touch.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'dev-ui-mobile',
      testMatch: [
        '**/*-touch.spec.ts',
        '**/badges.spec.ts',
        '**/dialog-screens.spec.ts',
      ],
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
