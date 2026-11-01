import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { rateLimitBucket } from '../db/schema';

/** Consistent row order avoids deadlocks when simultaneous requests share buckets. */
export function incrementRateLimitBuckets(
  db: DbExecutor,
  keys: readonly string[],
  windowStart: Date,
) {
  return db
    .insert(rateLimitBucket)
    .values([...keys].sort().map((key) => ({ key, windowStart, count: 1 })))
    .onConflictDoUpdate({
      target: [rateLimitBucket.key, rateLimitBucket.windowStart],
      set: { count: sql`least(${rateLimitBucket.count}, 2147483646) + 1` },
    })
    .returning({ key: rateLimitBucket.key, count: rateLimitBucket.count });
}

export async function readRateLimitBucket(
  db: DbExecutor,
  key: string,
  windowStart: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: rateLimitBucket.count })
    .from(rateLimitBucket)
    .where(
      and(
        eq(rateLimitBucket.key, key),
        eq(rateLimitBucket.windowStart, windowStart),
      ),
    )
    .limit(1);
  return row?.count ?? 0;
}

export async function decrementRateLimitBucket(
  db: DbExecutor,
  key: string,
  windowStart: Date,
) {
  await db
    .update(rateLimitBucket)
    .set({ count: sql`greatest(${rateLimitBucket.count} - 1, 0)` })
    .where(
      and(
        eq(rateLimitBucket.key, key),
        eq(rateLimitBucket.windowStart, windowStart),
      ),
    );
}
