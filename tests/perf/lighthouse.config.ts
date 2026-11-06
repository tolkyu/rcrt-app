import { defineConfig } from '@playwright/test';
import runtimeConfig from './playwright.config';

export default defineConfig({
  ...runtimeConfig,
  testMatch: 'lighthouse.spec.ts',
  timeout: 180_000,
  outputDir: './results/lighthouse/traces',
  use: { ...runtimeConfig.use, trace: 'off' },
});
