import { and, eq, lt } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { idempotencyKey } from '../db/schema';

export type IdempotencyClaim =
  | { readonly replayed: false }
  | {
      readonly replayed: true;
      readonly requestHash: string;
      readonly resourceId: string;
    };

/**
 * One upsert claims the key: it inserts, or replaces an expired row of the same key. A concurrent holder blocks the
 * statement on the unique index until it commits or rolls back, so a duplicate then sees the committed row and gets no
 * returned row back, which means replay or conflict.
 */
export async function claimIdempotencyKey(
  db: DbExecutor,
  claim: {
    readonly userId: string;
    readonly operation: string;
    readonly key: string;
    readonly requestHash: string;
    readonly resourceId: string;
    readonly now: Date;
    readonly expiredBefore: Date;
  },
): Promise<IdempotencyClaim> {
  const [claimed] = await db
    .insert(idempotencyKey)
    .values({
      userId: claim.userId,
      operation: claim.operation,
      key: claim.key,
      requestHash: claim.requestHash,
      resourceId: claim.resourceId,
      createdAt: claim.now,
    })
    .onConflictDoUpdate({
      target: [
        idempotencyKey.userId,
        idempotencyKey.operation,
        idempotencyKey.key,
      ],
      set: {
        requestHash: claim.requestHash,
        resourceId: claim.resourceId,
        createdAt: claim.now,
      },
      setWhere: lt(idempotencyKey.createdAt, claim.expiredBefore),
    })
    .returning({ id: idempotencyKey.id });
  if (claimed) return { replayed: false };
  const [existing] = await db
    .select({
      requestHash: idempotencyKey.requestHash,
      resourceId: idempotencyKey.resourceId,
    })
    .from(idempotencyKey)
    .where(
      and(
        eq(idempotencyKey.userId, claim.userId),
        eq(idempotencyKey.operation, claim.operation),
        eq(idempotencyKey.key, claim.key),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('Idempotency key vanished during the claim');
  return { replayed: true, ...existing };
}
