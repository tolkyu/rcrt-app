import { createHmac, randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { RateLimitedError } from '../../server/http/errors';
import { clientIp } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import {
  AUTH_LIMITS,
  assertBelowLimit,
  consumeAuthRateLimit,
  consumeRateLimit,
} from '../../server/security/rate-limit';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const client = postgres(urls.runtime, { max: 12, prepare: false });
const db = drizzle(client, { schema });
const admin = connectTestDatabase(urls.migration);
const secret = 'qa-only-rate-limit-hmac-secret-at-least32bytes';
const now = new Date('2026-11-16T08:01:15.123Z');
const keys = new Set<string>();

function tracked(email: string, ip: string | null, keySecret = secret) {
  const emailKey = `auth:email:${createHmac('sha256', keySecret).update(email.trim().toLowerCase()).digest('hex')}`;
  const ipKey = `auth:ip:${createHmac('sha256', keySecret)
    .update(ip?.trim() || 'unknown')
    .digest('hex')}`;
  keys.add(emailKey);
  keys.add(ipKey);
  return { emailKey, ipKey };
}

function address() {
  return `2001:db8:${randomUUID().replaceAll('-', '').slice(0, 4)}:${randomUUID().replaceAll('-', '').slice(0, 4)}::1`;
}

afterEach(async () => {
  if (keys.size)
    await admin`delete from app.rate_limit_bucket where key in ${admin([...keys])}`;
  keys.clear();
});
afterAll(async () => {
  await Promise.all([client.end(), admin.end()]);
});

describe('Atomic PostgreSQL auth rate limits [SEC, STORY-FND-5, DG-09]', () => {
  it('allows exactly ten of eleven truly concurrent requests for one email', async () => {
    const email = `${randomUUID()}@fixture.test`;
    const ip = address();
    const { emailKey, ipKey } = tracked(email, ip);
    const attempts = await Promise.allSettled(
      Array.from({ length: 11 }, () =>
        consumeAuthRateLimit(db, now, email, ip, secret),
      ),
    );
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(10);
    const rejected = attempts.filter(
      (attempt) => attempt.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(RateLimitedError);
    expect(rejected[0]?.reason).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 825,
    });
    const buckets =
      await admin`select key, count, window_start from app.rate_limit_bucket where key in (${emailKey}, ${ipKey}) order by key`;
    expect(buckets).toHaveLength(2);
    expect(buckets.every((bucket) => bucket.count === 11)).toBe(true);
    expect(
      buckets.every(
        (bucket) =>
          bucket.window_start.toISOString() === '2026-11-16T08:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('allows exactly thirty concurrent requests sharing an IP across different emails', async () => {
    const ip = address();
    const emails = Array.from(
      { length: 31 },
      () => `${randomUUID()}@fixture.test`,
    );
    const { ipKey } = tracked(emails[0]!, ip);
    for (const email of emails) tracked(email, ip);
    const attempts = await Promise.allSettled(
      emails.map((email) => consumeAuthRateLimit(db, now, email, ip, secret)),
    );
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(30);
    const rejected = attempts.filter(
      (attempt) => attempt.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 825,
    });
    const [bucket] =
      await admin`select count from app.rate_limit_bucket where key = ${ipKey}`;
    expect(bucket?.count).toBe(31);
  });

  it('normalizes email and uses a stable HMAC fallback when there is no trusted IP [SEC-T4-08]', async () => {
    const email = `qa.${randomUUID()}@fixture.test`;
    const { emailKey, ipKey } = tracked(email, null);
    for (let index = 0; index < 10; index += 1) {
      await consumeAuthRateLimit(
        db,
        now,
        index % 2 ? `  ${email.toUpperCase()}  ` : email,
        index % 2 ? ' ' : null,
        secret,
      );
    }
    await expect(
      consumeAuthRateLimit(db, now, email, null, secret),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const buckets =
      await admin`select key, count from app.rate_limit_bucket where key in (${emailKey}, ${ipKey})`;
    expect(buckets).toHaveLength(2);
    expect(buckets.every((bucket) => bucket.count === 11)).toBe(true);
    expect(JSON.stringify(buckets)).not.toContain(email);
  });

  it('cannot split an anonymous confirmation bucket by rotating untrusted proxy headers', async () => {
    const key = `auth:confirm:ip:${createHmac('sha256', secret).update('unknown').digest('hex')}`;
    keys.add(key);
    for (let index = 1; index <= 2; index += 1) {
      await consumeRateLimit(db, now, secret, [
        {
          namespace: 'auth:confirm:ip',
          value: clientIp(
            new Headers({
              'x-forwarded-for': `192.0.2.${index}`,
              'x-vercel-forwarded-for': `192.0.2.${index}`,
            }),
            false,
          ),
          limit: 2,
        },
      ]);
    }
    await expect(
      consumeRateLimit(db, now, secret, [
        {
          namespace: 'auth:confirm:ip',
          value: clientIp(
            new Headers({ 'x-forwarded-for': '192.0.2.99' }),
            false,
          ),
          limit: 2,
        },
      ]),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const [bucket] =
      await admin`select count from app.rate_limit_bucket where key=${key}`;
    expect(bucket?.count).toBe(3);
  });

  it('skips a null non-IP identifier instead of manufacturing a shared user bucket', async () => {
    const namespace = `auth:optional:${randomUUID()}`;
    const key = `${namespace}:${createHmac('sha256', secret).update('unknown').digest('hex')}`;
    keys.add(key);
    await consumeRateLimit(db, now, secret, [
      { namespace, value: null, limit: 1 },
    ]);
    expect(
      await admin`select key from app.rate_limit_bucket where key=${key}`,
    ).toHaveLength(0);
  });

  it('resets at the exact 900-second boundary and rounds Retry-After up', async () => {
    const email = `${randomUUID()}@fixture.test`;
    const ip = address();
    const { emailKey } = tracked(email, ip);
    const beforeBoundary = new Date('2026-11-16T08:14:59.999Z');
    await consumeAuthRateLimit(db, beforeBoundary, email, ip, secret, {
      emailLimit: 1,
      ipLimit: 1,
      windowSeconds: 900,
    });
    await expect(
      consumeAuthRateLimit(db, beforeBoundary, email, ip, secret, {
        emailLimit: 1,
        ipLimit: 1,
        windowSeconds: 900,
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: 1 });
    await consumeAuthRateLimit(
      db,
      new Date('2026-11-16T08:15:00.000Z'),
      email,
      ip,
      secret,
      { emailLimit: 1, ipLimit: 1, windowSeconds: 900 },
    );
    const buckets =
      await admin`select count, window_start from app.rate_limit_bucket where key = ${emailKey} order by window_start`;
    expect(buckets.map((bucket) => bucket.count)).toEqual([2, 1]);
    expect(buckets.map((bucket) => bucket.window_start.toISOString())).toEqual([
      '2026-11-16T08:00:00.000Z',
      '2026-11-16T08:15:00.000Z',
    ]);
  });

  it('rolls back both counters with a caller-owned transaction', async () => {
    const email = `${randomUUID()}@fixture.test`;
    const ip = address();
    const { emailKey, ipKey } = tracked(email, ip);
    const rollback = new Error('rollback rate-limit fixture');
    await expect(
      db.transaction(async (tx) => {
        await consumeAuthRateLimit(tx, now, email, ip, secret);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      await admin`select key from app.rate_limit_bucket where key in (${emailKey}, ${ipKey})`,
    ).toHaveLength(0);
  });

  it('limits confirmation attempts independently of link requests at thirty per IP', async () => {
    const email = `${randomUUID()}@fixture.test`;
    const ip = address();
    const { ipKey } = tracked(email, ip);
    const confirmationKey = `auth:confirm:ip:${createHmac('sha256', secret).update(ip).digest('hex')}`;
    keys.add(confirmationKey);
    await consumeAuthRateLimit(db, now, email, ip, secret);
    const attempts = await Promise.allSettled(
      Array.from({ length: 31 }, () =>
        consumeRateLimit(db, now, secret, [
          {
            namespace: 'auth:confirm:ip',
            value: ip,
            limit: AUTH_LIMITS.confirmPerIp,
          },
        ]),
      ),
    );
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(30);
    const buckets =
      await admin`select key, count from app.rate_limit_bucket where key in (${ipKey}, ${confirmationKey}) order by key`;
    expect(buckets).toEqual([
      { key: confirmationKey, count: 31 },
      { key: ipKey, count: 1 },
    ]);
  });

  it('reads a failure counter without counting the read (TOTP lockout) [T4-F04]', async () => {
    const userId = randomUUID();
    const key = `auth:mfa:fail:${createHmac('sha256', secret).update(userId).digest('hex')}`;
    keys.add(key);
    const bucket = { namespace: 'auth:mfa:fail', value: userId, limit: 5 };
    for (let index = 0; index < 4; index += 1)
      await consumeRateLimit(db, now, secret, [bucket]);
    await assertBelowLimit(db, now, secret, bucket);
    await assertBelowLimit(db, now, secret, bucket);
    await consumeRateLimit(db, now, secret, [bucket]);
    await expect(
      assertBelowLimit(db, now, secret, bucket),
    ).rejects.toBeInstanceOf(RateLimitedError);
    const [row] =
      await admin`select count from app.rate_limit_bucket where key = ${key}`;
    expect(row?.count).toBe(5);
  });
});
