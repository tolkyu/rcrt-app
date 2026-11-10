import { and, eq, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { ResolvedVacancyListQuery } from '../../lib/schemas/vacancy';
import type { VacancyStatus } from '../authz/types';
import type { DbExecutor } from '../db';
import {
  appUser,
  position,
  vacancy,
  vacancyRecruiter,
  vertical,
} from '../db/schema';

type VacancyInsert = typeof vacancy.$inferInsert;

const lead = alias(appUser, 'vacancy_lead');
const participantSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  isActive: z.boolean(),
});
const summaryRowSchema = z.object({
  id: z.uuid(),
  publicNo: z.string().regex(/^[1-9]\d{0,18}$/),
  title: z.string(),
  vertical: z.object({ id: z.uuid(), name: z.string() }),
  position: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  teamLead: participantSchema.nullable(),
  recruiters: z.array(participantSchema),
  status: z.enum(['DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CANCELLED']),
  priority: z.enum(['NORMAL', 'URGENT']),
  source: z.enum(['APP', 'TELEGRAM_BOT']),
  openedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type VacancySummaryRow = z.infer<typeof summaryRowSchema>;
const detailRowSchema = summaryRowSchema.extend({
  headcount: z.number().int(),
  seniority: z.string().nullable(),
  workFormat: z.enum(['REMOTE', 'OFFICE', 'HYBRID']).nullable(),
  employmentType: z.string().nullable(),
  location: z.string().nullable(),
  salaryMinMinor: z.string().nullable(),
  salaryMaxMinor: z.string().nullable(),
  salaryCurrency: z.string().nullable(),
  probationDays: z.number().int(),
  recruiterInitiated: z.boolean(),
  version: z.number().int(),
});
export type VacancyDetailRow = z.infer<typeof detailRowSchema>;

const summaryColumns = sql`
  ${vacancy.id} as id, ${vacancy.publicNo} as "sortNo", ${vacancy.publicNo}::text as "publicNo", ${vacancy.title} as title,
  jsonb_build_object('id', ${vertical.id}, 'name', ${vertical.name}) as vertical,
  case when ${position.id} is null then null else jsonb_build_object('id', ${position.id}, 'name', ${position.name}) end as position,
  case when ${lead.id} is null then null else jsonb_build_object('id', ${lead.id}, 'fullName', ${lead.fullName}, 'isActive', ${lead.isActive}) end as "teamLead",
  ${vacancy.status} as status, ${vacancy.priorityFlag} as priority, ${vacancy.source} as source,
  ${vacancy.openedAt} as "openedAt", ${vacancy.createdAt} as "createdAt", ${vacancy.updatedAt} as "updatedAt"
`;
const fromVacancies = sql`from ${vacancy}
  join ${vertical} on ${vertical.id} = ${vacancy.verticalId}
  left join ${position} on ${position.id} = ${vacancy.positionId} and ${position.verticalId} = ${vacancy.verticalId}
  left join ${appUser} as ${sql.identifier('vacancy_lead')} on ${lead.id} = ${vacancy.teamLeadId}`;

const recruitersFor = (vacancyId: SQL) => sql`coalesce((
  select jsonb_agg(jsonb_build_object('id', ${appUser.id}, 'fullName', ${appUser.fullName}, 'isActive', ${appUser.isActive}) order by ${appUser.fullName} collate "uk-UA-x-icu", ${appUser.id})
  from ${vacancyRecruiter} join ${appUser} on ${appUser.id} = ${vacancyRecruiter.userId}
  where ${vacancyRecruiter.vacancyId} = ${vacancyId}
), '[]'::jsonb)`;

function filtersWhere(filters: ResolvedVacancyListQuery): SQL[] {
  const clauses: SQL[] = [];
  if (filters.vertical) clauses.push(eq(vacancy.verticalId, filters.vertical));
  if (filters.status) clauses.push(eq(vacancy.status, filters.status));
  if (filters.priority)
    clauses.push(eq(vacancy.priorityFlag, filters.priority));
  if (filters.q) {
    // ILIKE already escapes with a backslash; an explicit ESCAPE '\' is cooked to '' inside a template literal.
    const escaped = filters.q.replace(/[\\%_]/g, '\\$&');
    const match = /^v-(\d{1,19})$/i.exec(filters.q);
    const publicNo =
      match && BigInt(match[1]!) <= 9223372036854775807n
        ? BigInt(match[1]!)
        : null;
    clauses.push(sql`(${vacancy.title} ilike ${`%${escaped}%`}
      ${publicNo !== null ? sql`or ${vacancy.publicNo} = ${publicNo}` : sql``})`);
  }
  return clauses;
}

/**
 * Bounded page and page-local participants are resolved in one scoped statement. Fetching one row beyond
 * the limit answers "more in this direction". The cursor is only a position, so a row that left the visible
 * set meanwhile does not break paging, and no existence probe scans the whole set.
 */
export async function listVacancies(
  db: DbExecutor,
  scope: SQL,
  filters: ResolvedVacancyListQuery,
) {
  const newer = filters.direction === 'newer';
  const cursor = filters.cursor ? BigInt(filters.cursor) : null;
  const direction = newer ? sql`asc` : sql`desc`;
  const rows = await db.execute(sql`
    with visible as not materialized (
      select ${summaryColumns}
      ${fromVacancies}
      where ${and(isNull(vacancy.deletedAt), scope, ...filtersWhere(filters))}
    ), probe as (
      select * from visible
      where ${cursor === null ? sql`true` : sql`"sortNo" ${newer ? sql`>` : sql`<`} ${cursor}`}
      order by "sortNo" ${direction}
      limit ${filters.limit + 1}
    ), page as (
      select * from probe order by "sortNo" ${direction} limit ${filters.limit}
    )
    select coalesce((select jsonb_agg((to_jsonb(p) - 'sortNo') || jsonb_build_object('recruiters', ${recruitersFor(sql`p.id`)}) order by p."sortNo" desc) from page p), '[]'::jsonb) as items,
      (select count(*) from probe) > ${filters.limit} as more
  `);
  const result = z
    .object({ items: z.array(summaryRowSchema), more: z.boolean() })
    .parse(rows[0]);
  return {
    items: result.items,
    hasOlder: newer ? cursor !== null : result.more,
    hasNewer: newer ? result.more : cursor !== null,
  };
}

export async function findVacancy(db: DbExecutor, scope: SQL, id: string) {
  const rows = await db.execute(sql`
    select ${summaryColumns}, ${recruitersFor(sql`${vacancy.id}`)} as recruiters,
      ${vacancy.headcount} as headcount, ${vacancy.seniority} as seniority,
      ${vacancy.workFormat} as "workFormat", ${vacancy.employmentType} as "employmentType",
      ${vacancy.location} as location, ${vacancy.salaryMinMinor}::text as "salaryMinMinor",
      ${vacancy.salaryMaxMinor}::text as "salaryMaxMinor", ${vacancy.salaryCurrency} as "salaryCurrency",
      ${vacancy.probationDays} as "probationDays", ${vacancy.recruiterInitiated} as "recruiterInitiated", ${vacancy.version} as version
    ${fromVacancies}
    where ${and(eq(vacancy.id, id), isNull(vacancy.deletedAt), scope)}
    limit 1
  `);
  return rows[0] ? detailRowSchema.parse(rows[0]) : null;
}

export type NewVacancy = Omit<
  VacancyInsert,
  | 'publicNo'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'deletedBy'
  | 'deleteReason'
> & { readonly createdAt: Date };

/** `public_no` comes from the identity sequence; the number is returned so the creation event can carry it. */
export async function insertVacancy(db: DbExecutor, values: NewVacancy) {
  const [row] = await db
    .insert(vacancy)
    .values({ ...values, updatedAt: values.createdAt })
    .returning({ id: vacancy.id, publicNo: vacancy.publicNo });
  return row!;
}

export async function insertVacancyRecruiter(
  db: DbExecutor,
  row: {
    readonly vacancyId: string;
    readonly userId: string;
    readonly assignedBy: string;
    readonly assignedAt: Date;
  },
) {
  await db.insert(vacancyRecruiter).values(row);
}

/** Live DRAFT rows of one author, served by `vacancy_draft_author_idx`. */
export async function countLiveDrafts(
  db: DbExecutor,
  authorId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vacancy)
    .where(
      and(
        eq(vacancy.createdBy, authorId),
        eq(vacancy.status, 'DRAFT'),
        isNull(vacancy.deletedAt),
      ),
    );
  return row!.count;
}

export type VacancyRow = typeof vacancy.$inferSelect;
type DocColumn = 'descriptionDoc' | 'requirementsDoc';
/** Scalar columns of a locked vacancy; the two rich-text documents are loaded only for a patch that touches them. */
export type VacancyLock = Omit<VacancyRow, DocColumn> &
  Partial<Pick<VacancyRow, DocColumn>>;
export type VacancyChanges = Partial<
  Omit<
    VacancyInsert,
    | 'id'
    | 'publicNo'
    | 'verticalId'
    | 'source'
    | 'createdBy'
    | 'createdAt'
    | 'updatedAt'
    | 'version'
  >
>;

const { descriptionDoc, requirementsDoc, ...scalarColumns } =
  getTableColumns(vacancy);
const stateColumns = {
  status: vacancy.status,
  deletedAt: vacancy.deletedAt,
  createdBy: vacancy.createdBy,
  version: vacancy.version,
};

/** `NO KEY UPDATE` serialises lifecycle writers but, unlike `UPDATE`, does not stall the FK checks of event and recruiter inserts (KEY SHARE). */
export async function lockVacancy(
  db: DbExecutor,
  id: string,
  options: { readonly docs?: boolean } = {},
): Promise<VacancyLock | null> {
  const [row] = await db
    .select(
      options.docs
        ? { ...scalarColumns, descriptionDoc, requirementsDoc }
        : scalarColumns,
    )
    .from(vacancy)
    .where(eq(vacancy.id, id))
    .for('no key update')
    .limit(1);
  return row ?? null;
}

/** Unlocked state read that tells why a compare-and-set matched no row. */
export async function findVacancyState(db: DbExecutor, id: string) {
  const [row] = await db
    .select(stateColumns)
    .from(vacancy)
    .where(eq(vacancy.id, id))
    .limit(1);
  return row ?? null;
}

/** What the row must still be for a lifecycle write to apply; `deleted_at IS NULL` always holds. */
export interface VacancyExpectation {
  readonly status: VacancyStatus;
  readonly version?: number;
  readonly authorId?: string;
}

/** Compare-and-set on the columns `app_rw` may update; false means the row no longer matched (state, author, version or deletion). */
export async function updateVacancy(
  db: DbExecutor,
  id: string,
  expected: VacancyExpectation,
  changes: VacancyChanges,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(vacancy)
    .set({ ...changes, updatedAt: now, version: sql`${vacancy.version} + 1` })
    .where(
      and(
        eq(vacancy.id, id),
        eq(vacancy.status, expected.status),
        isNull(vacancy.deletedAt),
        expected.authorId === undefined
          ? undefined
          : eq(vacancy.createdBy, expected.authorId),
        expected.version === undefined
          ? undefined
          : eq(vacancy.version, expected.version),
      ),
    )
    .returning({ id: vacancy.id });
  return rows.length === 1;
}
