import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const development = process.env.NODE_ENV === 'development';

const config: NextConfig = {
  poweredByHeader: false,
  // Dev-only routes (`*.dev.tsx`) are not even compiled outside `next dev` (DG-12b, T4-H01).
  pageExtensions: development
    ? ['dev.tsx', 'dev.ts', 'tsx', 'ts']
    : ['tsx', 'ts'],
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // DG-01: baked at build time; instrumentation refuses to boot a perf build on hosted environments.
  env: { PERF_BUILD: process.env.PERF_BUILD === '1' ? '1' : '' },
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['radix-ui'] },
  serverExternalPackages: ['pino', 'postgres'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin('./lib/i18n/request.ts')(config);
