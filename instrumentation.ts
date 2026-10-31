export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { parseRuntimeEnv } = await import('./lib/env');
    parseRuntimeEnv(process.env);
  }
}
