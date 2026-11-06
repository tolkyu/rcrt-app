import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function localStatusValue(
  status: Record<string, unknown>,
  name: string,
) {
  const value = status[name];
  if (typeof value !== 'string' || !value || /[\r\n]/.test(value))
    throw new Error(`Local Supabase status is missing ${name}`);
  return value;
}

export function localStatusUrl(status: Record<string, unknown>, name: string) {
  const value = localStatusValue(status, name);
  const url = new URL(value);
  if (!LOOPBACK.has(url.hostname) || url.search || url.hash)
    throw new Error(`Local Supabase ${name} must use loopback`);
  return url;
}

/** Status includes credentials, so subprocess output must never reach the terminal or an exception. */
export function readLocalSupabaseStatus(): Record<string, unknown> {
  try {
    const cli = join(
      dirname(require.resolve('supabase/package.json')),
      'dist/supabase.js',
    );
    const result: unknown = JSON.parse(
      execFileSync(process.execPath, [cli, 'status', '--output', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      }),
    );
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('Invalid status');
    return result as Record<string, unknown>;
  } catch {
    throw new Error(
      'Cannot read local Supabase status; start the local stack first',
    );
  }
}
