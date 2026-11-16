import 'server-only';
import { appEnvSchema, parseRuntimeEnv, type RuntimeEnv } from '@/lib/env';

let cached: RuntimeEnv | undefined;

export function rateLimitSecret(): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new Error('Invalid rate limit configuration');
  return secret;
}

/** Validated APP_ENV alone: `runtimeEnv()` needs the whole auth and database set, which a service-level test does not carry; boot already ran the full contract. */
export const appEnv = () => appEnvSchema.parse(process.env.APP_ENV);

/** Validated once per server instance; boot (instrumentation.ts) already refused an invalid set. */
export function runtimeEnv(): RuntimeEnv {
  cached ??= parseRuntimeEnv(process.env);
  return cached;
}
