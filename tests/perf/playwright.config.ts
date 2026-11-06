import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from '../support/origins';

export default defineConfig({
  testDir: '.',
  testMatch: 'foundation.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: 'list',
  outputDir: './results/traces',
  use: { baseURL: E2E_ORIGIN, trace: 'retain-on-failure' },
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'node node_modules/next/dist/bin/next start --port 3100',
    url: `${E2E_ORIGIN}/api/health`,
    reuseExistingServer: false,
    env: {
      APP_ENV: 'test',
      APP_URL: E2E_ORIGIN,
      NEXT_TELEMETRY_DISABLED: '1',
      AUTH_GOOGLE_ENABLED: 'false',
    },
    timeout: 60_000,
  },
});
