import { asc, inArray, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { vertical } from '../db/schema';

/** Every vertical list is scoped by the caller's grant predicate (VIS-02). */
export function listVerticals(db: DbExecutor, scope: SQL) {
  return db
    .select({ id: vertical.id, name: vertical.name })
    .from(vertical)
    .where(scope)
    .orderBy(asc(vertical.name), asc(vertical.id));
}

/** Names for ids the caller already holds through its own role assignments. */
export function findVerticalNames(db: DbExecutor, ids: readonly string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select({ id: vertical.id, name: vertical.name })
    .from(vertical)
    .where(inArray(vertical.id, [...ids]));
}
