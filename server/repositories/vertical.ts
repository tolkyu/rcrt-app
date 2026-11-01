import { asc, type SQL } from 'drizzle-orm';
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
