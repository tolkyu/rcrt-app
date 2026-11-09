import { z } from 'zod';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
/** A replay inside this window returns the original result; after it the key can be reused. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** A UUID fits; the charset keeps the key safe to store and log. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/)
  .meta({
    description:
      'Client-generated unique key (16–64 of A–Z a–z 0–9 _ -, a UUID fits). The same key with the same body inside 24 hours returns the original result; the same key with a different body answers 409 IDEMPOTENCY_KEY_REUSED.',
  });
