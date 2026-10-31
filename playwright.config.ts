import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:3100';

export default defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --port 3100',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: { APP_ENV: 'test', APP_URL: baseURL, NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 60_000,
  },
  projects: [
    {
      name: 'e2e-desktop',
      testMatch: 'e2e/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'e2e-mobile',
      testMatch: 'e2e/**/*.spec.ts',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    ...(['desktop', 'mobile'] as const).flatMap((viewport) =>
      (['light', 'dark'] as const).map((theme) => ({
        name: `screens-foundation-${viewport}-${theme}`,
        testMatch: 'screens/**/*.spec.ts',
        use: {
          ...devices[viewport === 'desktop' ? 'Desktop Chrome' : 'Pixel 7'],
          viewport:
            viewport === 'desktop'
              ? { width: 1440, height: 900 }
              : { width: 390, height: 844 },
          colorScheme: theme,
          reducedMotion: 'reduce' as const,
        },
      })),
    ),
  ],
});
