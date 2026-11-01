import 'server-only';
import { parseRuntimeEnv, type RuntimeEnv } from '@/lib/env';

let cached: RuntimeEnv | undefined;

/** Validated once per server instance; boot (instrumentation.ts) already refused an invalid set. */
export function runtimeEnv(): RuntimeEnv {
  cached ??= parseRuntimeEnv(process.env);
  return cached;
}
