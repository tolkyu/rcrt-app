import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const development = process.env.NODE_ENV === 'development';

/** The message formatter is a few kB once messages are precompiled, below webpack's 20 kB split threshold: without this group every nested provider's entry chunk gets its own copy, and PERF-04 gzips each file on its own. */
const INTL_MODULES =
  /node_modules\/(?:use-intl|next-intl|@formatjs|icu-minify)\//;

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
  experimental: {
    optimizePackageImports: ['radix-ui', '@tanstack/react-query'],
  },
  webpack(webpackConfig, { isServer, dev }) {
    const splitChunks = webpackConfig.optimization.splitChunks;
    if (!isServer && !dev && typeof splitChunks === 'object')
      splitChunks.cacheGroups.intl = {
        name: 'intl',
        chunks: 'all',
        priority: 35,
        enforce: true,
        test: (module: { nameForCondition?: () => string | null }) =>
          INTL_MODULES.test(
            (module.nameForCondition?.() ?? '').replaceAll('\\', '/'),
          ),
      };
    return webpackConfig;
  },
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

export default createNextIntlPlugin({
  requestConfig: './lib/i18n/request.ts',
  // Catalog precompilation needs the webpack loader (the Turbopack one requires Next 16); `next dev --turbopack` keeps the runtime parser.
  experimental: development
    ? {}
    : {
        messages: {
          path: './messages',
          format: 'json',
          locales: 'infer',
          precompile: true,
        },
      },
})(config);
