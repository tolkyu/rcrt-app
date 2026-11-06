import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const fileEnv = loadEnv('test', process.cwd(), 'TEST_DATABASE_');
const databaseTestEnv = Object.fromEntries(
  ['TEST_DATABASE_URL', 'TEST_DATABASE_RUNTIME_URL'].flatMap((name) => {
    const value = process.env[name] ?? fileEnv[name];
    return value ? [[name, value]] : [];
  }),
);

export default defineConfig({
  // tsconfig keeps JSX for Next.js; component tests need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Server modules are exercised directly in Node; this is the package's own react-server entry.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['./tests/integration/setup.ts'],
          env: {
            ...databaseTestEnv,
            AUTH_RATE_LIMIT_SECRET:
              'integration-only-rate-limit-secret-0123456789',
          },
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
