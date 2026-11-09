import { and, eq, sql, type SQL } from 'drizzle-orm';
import { POSITION_LIST_LIMIT } from '../../lib/schemas/position';
import type { DbExecutor } from '../db';
import { position, vacancy, vertical } from '../db/schema';

const columns = {
  id: position.id,
  verticalId: position.verticalId,
  name: position.name,
  isActive: position.isActive,
  version: position.version,
  createdAt: position.createdAt,
};

export type PositionRow = Awaited<ReturnType<typeof insertPosition>>;

/**
 * Live OPEN vacancies only (owner 2026-11-09: drafts and vacancies on hold are not «відкриті»); served by
 * `vacancy_position_idx`. Columns are spelled out because Drizzle drops table qualifiers in single-table selects, which would bind both sides to the inner table.
 */
const openVacanciesCount = sql<number>`(
  select count(*)::int from ${vacancy} as "open_vacancy"
  where "open_vacancy"."position_id" = "position"."id"
    and "open_vacancy"."vertical_id" = "position"."vertical_id"
    and "open_vacancy"."deleted_at" is null
    and "open_vacancy"."status" = 'OPEN'
)`;

/**
 * One scoped statement; counts are computed only for the manager list, whose scope is `position.manage`,
 * so a caller never receives counts for a vertical they cannot manage (ADR-013). Fetches one row more than
 * the list limit so the service can fail loudly instead of silently dropping the alphabetical tail.
 */
export async function listPositions(
  db: DbExecutor,
  scope: SQL,
  options: {
    readonly verticalId: string | undefined;
    readonly activeOnly: boolean;
    readonly withCounts: boolean;
  },
) {
  return db
    .select({
      ...columns,
      openVacanciesCount: options.withCounts
        ? openVacanciesCount
        : sql<null>`null`,
    })
    .from(position)
    .where(
      and(
        scope,
        options.verticalId
          ? eq(position.verticalId, options.verticalId)
          : undefined,
        options.activeOnly ? eq(position.isActive, true) : undefined,
      ),
    )
    .orderBy(sql`${position.name} collate "uk-UA-x-icu"`, position.id)
    .limit(POSITION_LIST_LIMIT + 1);
}

/** Serializes catalog creates per vertical so the size cap is exact; `NO KEY UPDATE` does not block position FK checks (KEY SHARE). */
export async function lockVerticalForCatalog(
  db: DbExecutor,
  verticalId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: vertical.id })
    .from(vertical)
    .where(eq(vertical.id, verticalId))
    .for('no key update')
    .limit(1);
  return row !== undefined;
}

/** Inactive rows count too: positions are never deleted, so they keep occupying the catalog. */
export async function countPositions(
  db: DbExecutor,
  verticalId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(position)
    .where(eq(position.verticalId, verticalId));
  return row!.count;
}

/** Serializes catalog writers; a rename updates `name_key`, a column of a plain unique index, so Postgres then takes the stronger tuple lock and briefly blocks vacancy FK checks (KEY SHARE) on that position. */
export async function lockPosition(
  db: DbExecutor,
  scope: SQL,
  positionId: string,
) {
  const [row] = await db
    .select(columns)
    .from(position)
    .where(and(eq(position.id, positionId), scope))
    .for('no key update')
    .limit(1);
  return row ?? null;
}

export async function insertPosition(
  db: DbExecutor,
  input: {
    readonly verticalId: string;
    readonly name: string;
    readonly nameKey: string;
    readonly createdBy: string;
    readonly now: Date;
  },
) {
  const [row] = await db
    .insert(position)
    .values({
      verticalId: input.verticalId,
      name: input.name,
      nameKey: input.nameKey,
      createdBy: input.createdBy,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning(columns);
  return row!;
}

/** Only the columns `app_rw` may update; the caller already checked the expected version under the row lock. */
export async function updatePosition(
  db: DbExecutor,
  positionId: string,
  changes: {
    readonly name?: string;
    readonly nameKey?: string;
    readonly isActive?: boolean;
  },
  now: Date,
) {
  const [row] = await db
    .update(position)
    .set({
      ...changes,
      updatedAt: now,
      version: sql`${position.version} + 1`,
    })
    .where(eq(position.id, positionId))
    .returning(columns);
  return row!;
}
