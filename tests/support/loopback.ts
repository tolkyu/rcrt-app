const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Test tooling may only ever talk to the local stack; anything else is refused before a request is made. */
export function requireLoopbackUrl(
  name: string,
  value: string | undefined,
): string {
  if (value && URL.canParse(value) && LOOPBACK.has(new URL(value).hostname))
    return value;
  throw new Error(`${name} must point to a loopback host (local stack)`);
}
