import 'server-only';
import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, member]) => member !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, member]) => [key, canonical(member)]),
    );
  return value;
}

/** Hash of the validated body with sorted keys, so key order and omitted optionals never change the identity of a request. */
export const requestHash = (body: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical(body)))
    .digest('hex');
