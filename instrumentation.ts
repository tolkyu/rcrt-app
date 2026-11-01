export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { parseRuntimeEnv } = await import('./lib/env');
    // PERF_BUILD is inlined by next.config.ts at build time, so a runtime env var cannot switch it on.
    parseRuntimeEnv(process.env, process.env.PERF_BUILD === '1');
  }
}
