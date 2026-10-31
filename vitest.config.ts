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
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
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
          env: databaseTestEnv,
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
