import 'server-only';
import { createHmac } from 'node:crypto';
import type { DbExecutor } from '../db';
import type { Clock } from '../domain/clock';
import { RateLimitedError, UnauthenticatedError } from '../http/errors';
import { lockMfaState, setMfaLock } from '../repositories/auth';
import {
  decrementRateLimitBucket,
  incrementRateLimitBuckets,
  readRateLimitBucket,
} from '../repositories/rate-limit';

export interface RateLimitBucket {
  /** Bucket family, e.g. `auth:email`; the identifier itself is stored only as an HMAC. */
  readonly namespace: string;
  /** Unknown IPs share a conservative bucket; missing non-IP identifiers do not create a bucket. */
  readonly value: string | null;
  readonly limit: number;
}

export interface AuthRateLimitConfig {
  readonly emailLimit: number;
  readonly ipLimit: number;
  readonly windowSeconds: number;
}

const WINDOW_SECONDS = 900;
const defaultAuthConfig: AuthRateLimitConfig = {
  emailLimit: 10,
  ipLimit: 30,
  windowSeconds: WINDOW_SECONDS,
};

/** Limits from docs/security/t4-auth-requirements.md (C02, C10, E09, F04); one 15-minute fixed window. */
export const AUTH_LIMITS = {
  confirmPerIp: 30,
  confirmPerToken: 5,
  invitePerIp: 10,
  invitePerToken: 5,
  mfaFailuresPerUser: 5,
  mfaEnrollPerUser: 10,
  googlePerIp: 30,
} as const;

function assertConfig(secret: string, now: Date, values: readonly number[]) {
  if (
    typeof secret !== 'string' ||
    secret.trim().length < 32 ||
    !Number.isFinite(now.getTime()) ||
    values.some(
      (value) =>
        !Number.isSafeInteger(value) || value < 1 || value > 2147483646,
    )
  ) {
    throw new Error('Invalid rate limit configuration');
  }
}

function bucketKey(namespace: string, value: string, secret: string) {
  return `${namespace}:${createHmac('sha256', secret).update(value).digest('hex')}`;
}

function windowOf(now: Date, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  return {
    start,
    retryAfter: Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000),
  };
}

/** Counts every bucket before rejecting, so rotating one identifier cannot bypass the others (DG-09). */
export async function consumeRateLimit(
  db: DbExecutor,
  now: Date,
  secret: string,
  buckets: readonly RateLimitBucket[],
  windowSeconds = WINDOW_SECONDS,
): Promise<void> {
  assertConfig(secret, now, [
    windowSeconds,
    ...buckets.map((bucket) => bucket.limit),
  ]);
  const keyed = buckets.flatMap((bucket) => {
    const value =
      bucket.value?.trim() ||
      (bucket.namespace.endsWith(':ip') ? 'unknown' : null);
    return value
      ? [
          {
            key: bucketKey(bucket.namespace, value, secret),
            limit: bucket.limit,
          },
        ]
      : [];
  });
  if (keyed.length === 0) return;
  const { start, retryAfter } = windowOf(now, windowSeconds);
  const counts = await incrementRateLimitBuckets(
    db,
    keyed.map(({ key }) => key),
    start,
  );
  if (
    counts.some((row) =>
      keyed.some(
        (bucket) => bucket.key === row.key && row.count > bucket.limit,
      ),
    )
  ) {
    throw new RateLimitedError(retryAfter);
  }
}

/** Throws while a failure counter is at its limit, without counting this call (TOTP lockout, T4-F04). */
export async function assertBelowLimit(
  db: DbExecutor,
  now: Date,
  secret: string,
  bucket: RateLimitBucket & { readonly value: string },
  windowSeconds = WINDOW_SECONDS,
): Promise<void> {
  assertConfig(secret, now, [windowSeconds, bucket.limit]);
  const { start, retryAfter } = windowOf(now, windowSeconds);
  const count = await readRateLimitBucket(
    db,
    bucketKey(bucket.namespace, bucket.value, secret),
    start,
  );
  if (count >= bucket.limit) throw new RateLimitedError(retryAfter);
}

/** Reserves capacity under a short user lock; provider I/O runs only after this transaction commits. */
export async function reserveMfaAttempt(
  db: DbExecutor,
  clock: Clock,
  userId: string,
  secret: string,
) {
  const failureKey = bucketKey('auth:mfa:fail', userId, secret);
  const pendingKey = bucketKey('auth:mfa:pending', userId, secret);
  const start = await db.transaction(async (tx) => {
    const user = await lockMfaState(tx, userId);
    if (!user?.isActive) throw new UnauthenticatedError();
    const now = clock.now();
    assertConfig(secret, now, [WINDOW_SECONDS]);
    if (user.lockedUntil && user.lockedUntil > now)
      throw new RateLimitedError(
        Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000),
      );
    const window = windowOf(now, WINDOW_SECONDS);
    const failures = await readRateLimitBucket(tx, failureKey, window.start);
    const pending = await readRateLimitBucket(tx, pendingKey, window.start);
    if (failures + pending >= AUTH_LIMITS.mfaFailuresPerUser)
      throw new RateLimitedError(window.retryAfter);
    await incrementRateLimitBuckets(tx, [pendingKey], window.start);
    return window.start;
  });
  let released = false;
  return {
    async release(outcome: 'invalid' | 'success' | 'aborted') {
      if (released) throw new Error('MFA attempt already released');
      const result = await db.transaction(async (tx) => {
        const user = await lockMfaState(tx, userId);
        if (!user) throw new UnauthenticatedError();
        await decrementRateLimitBucket(tx, pendingKey, start);
        const now = clock.now();
        let lockedUntil = user.lockedUntil;
        let newlyLocked = false;
        if (outcome === 'invalid') {
          const [failure] = await incrementRateLimitBuckets(
            tx,
            [failureKey],
            start,
          );
          if (failure!.count >= AUTH_LIMITS.mfaFailuresPerUser) {
            lockedUntil = new Date(now.getTime() + WINDOW_SECONDS * 1000);
            await setMfaLock(tx, userId, lockedUntil);
            newlyLocked = true;
          }
        }
        return { lockedUntil, newlyLocked };
      });
      released = true;
      return result;
    },
  };
}

/** Magic-link requests: per normalised email and per trusted client IP (STORY-FND-5). */
export async function consumeAuthRateLimit(
  db: DbExecutor,
  now: Date,
  email: string,
  ip: string | null,
  secret: string,
  config: AuthRateLimitConfig = defaultAuthConfig,
): Promise<void> {
  await consumeRateLimit(
    db,
    now,
    secret,
    [
      {
        namespace: 'auth:email',
        value: email.trim().toLowerCase(),
        limit: config.emailLimit,
      },
      { namespace: 'auth:ip', value: ip, limit: config.ipLimit },
    ],
    config.windowSeconds,
  );
}
