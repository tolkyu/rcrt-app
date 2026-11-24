import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function stubLocalDevelopment() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('APP_ENV', 'local');
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
}

describe('/dev/ui gallery guard [UI foundation F1, DEV-1]', () => {
  it('renders in local development', async () => {
    stubLocalDevelopment();
    const { default: DevUiPage } = await import('@/app/dev/ui/page.dev');
    await expect(DevUiPage()).resolves.toBeTruthy();
  }, 20_000);

  it.each([
    ['production build', { NODE_ENV: 'production' }],
    ['test run', { NODE_ENV: 'test' }],
    ['hosted Supabase', { SUPABASE_URL: 'https://project.supabase.co' }],
    ['non-local environment', { APP_ENV: 'staging' }],
  ])('responds 404 in a %s', async (_name, override) => {
    stubLocalDevelopment();
    for (const [key, value] of Object.entries(override)) vi.stubEnv(key, value);
    const { default: DevUiPage } = await import('@/app/dev/ui/page.dev');
    await expect(DevUiPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is excluded from the route tree outside next dev', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: config } = await import('@/next.config');
    expect(config.pageExtensions).toEqual(['tsx', 'ts']);
  });
});
