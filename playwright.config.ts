import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:3100';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
/** These rename the shared, undeletable demo verticals (D34): they run last, one worker, mobile after desktop. */
const ADMIN_MUTATION_SPECS = 'e2e/settings-*.spec.ts';

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
    { name: 'e2e-sessions', testMatch: 'e2e/sessions.setup.ts' },
    {
      name: 'e2e-desktop',
      testMatch: 'e2e/**/*.spec.ts',
      testIgnore: ADMIN_MUTATION_SPECS,
      dependencies: ['e2e-sessions'],
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP },
    },
    {
      name: 'e2e-mobile',
      testMatch: 'e2e/**/*.spec.ts',
      testIgnore: ADMIN_MUTATION_SPECS,
      dependencies: ['e2e-sessions'],
      use: { ...devices['Pixel 7'], viewport: MOBILE },
    },
    {
      name: 'e2e-admin-desktop',
      testMatch: ADMIN_MUTATION_SPECS,
      workers: 1,
      dependencies: ['e2e-desktop', 'e2e-mobile'],
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP },
    },
    {
      name: 'e2e-admin-mobile',
      testMatch: ['e2e/settings-audit.spec.ts', 'e2e/settings-users.spec.ts'],
      workers: 1,
      dependencies: ['e2e-admin-desktop'],
      use: { ...devices['Pixel 7'], viewport: MOBILE },
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
