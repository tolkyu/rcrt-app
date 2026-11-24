import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const directory = resolve(
  process.env.CI_LOG_RUN ?? '.cache/ci-log-canary',
  process.env.CI_LOG_CASE ?? 'main',
);

export default defineConfig({
  testDir: '.',
  captureGitInfo: { commit: false, diff: false },
  testMatch: 'privacy.canary.ts',
  workers: 1,
  retries: 1,
  timeout: 8_000,
  outputDir: resolve(directory, 'raw'),
  reporter: [
    [
      '../support/private-reporter.ts',
      { outputFolder: resolve(directory, 'report') },
    ],
  ],
  use: { trace: 'off' },
  globalTeardown:
    process.env.CI_LOG_CASE === 'global' ? './privacy.teardown.ts' : undefined,
});
