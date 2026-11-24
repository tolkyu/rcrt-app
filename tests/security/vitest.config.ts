import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: false,
  test: {
    environment: 'node',
    include: [
      'tests/unit/report-privacy.test.ts',
      'tests/unit/safe-page-context.test.ts',
    ],
  },
});
