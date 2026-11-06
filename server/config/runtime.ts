import 'server-only';
import { parseRuntimeEnv, type RuntimeEnv } from '@/lib/env';

let cached: RuntimeEnv | undefined;

export function rateLimitSecret(): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new Error('Invalid rate limit configuration');
  return secret;
}

/** Validated once per server instance; boot (instrumentation.ts) already refused an invalid set. */
export function runtimeEnv(): RuntimeEnv {
  cached ??= parseRuntimeEnv(process.env);
  return cached;
}
