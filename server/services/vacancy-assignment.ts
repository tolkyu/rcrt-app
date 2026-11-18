import {
  assignVacancyRecruitersSchema,
  claimVacancySchema,
  unassignVacancyRecruiterQuerySchema,
  type AssignableRecruiters,
  type AssignVacancyRecruitersInput,
  type UnassignVacancyRecruiterQuery,
} from '../../lib/schemas/vacancy-assignment';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { writeAudit } from '../audit';
import { hasAnyGrant, requirePermission } from '../authz/can';
import type { AuthContext } from '../authz/context';
import type { VerticalId } from '../authz/types';
import { hasGrantCovering, isTeamEditable } from '../authz/vacancy-assignment';
import { grantCovers } from '../authz/vacancy-author';
import type { RequestContext } from '../context/request-context';
import type { DbExecutor } from '../db';
import { appendEvent } from '../events';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../http/errors';
import { uuidOf } from '../http/params';
import { lockVacancy, updateVacancy } from '../repositories/vacancy';
import {
  deleteRecruiter,
  findAssignableRecruiters,
  insertRecruiters,
  listRecruiterIds,
} from '../repositories/vacancy-recruiter';
import { consumeVacancyWriteLimit, lockAuthors, readVacancy } from './vacancy';

/**
 * Steps 2-5 of ADR-017: scoped read (404) and grant (403) on the loaded detail, users `FOR SHARE` before the vacancy row,
 * fresh grant on the re-read roles, then the vacancy lock and the recruiter set read under it. Never a user lock after the vacancy lock.
 */
async function lockTeam(
  ctx: RequestContext,
  tx: DbExecutor,
  id: string,
  others: readonly string[],
  holdsGrant: (auth: AuthContext, verticalId: VerticalId) => boolean,
) {
  const verticalId: VerticalId = (await readVacancy(ctx, tx, id)).vertical.id;
  if (!holdsGrant(ctx.auth, verticalId)) throw new ForbiddenError();
  const authors = await lockAuthors(ctx, tx, others);
  if (!holdsGrant(authors.auth, verticalId)) throw new ForbiddenError();
  const row = await lockVacancy(tx, id);
  if (!row || row.deletedAt) throw new NotFoundError();
  return {
    verticalId,
    authors,
    row,
    members: await listRecruiterIds(tx, id),
    fresh: { ...ctx, auth: authors.auth },
  };
}
type Locked = Awaited<ReturnType<typeof lockTeam>>;

/** One version bump per request; the compare-and-set also fails if the status moved under the lock. */
async function bumpVersion(
  ctx: RequestContext,
  tx: DbExecutor,
  id: string,
  { row }: Locked,
) {
  const applied = await updateVacancy(
    tx,
    id,
    { status: row.status, version: row.version },
    {},
    ctx.clock.now(),
  );
  if (!applied) throw new ConflictError('STALE_STATE');
}

/** Legality before the caller's version (ADR-016), so a stale caller on a closed vacancy learns the real reason. */
const assertEditable = ({ row }: Locked) => {
  if (!isTeamEditable(row.status)) throw new ConflictError('VACANCY_CLOSED');
};
const assertVersion = ({ row }: Locked, expectedVersion: number) => {
  if (row.version !== expectedVersion) throw new ConflictError('STALE_STATE');
};

/** Ids only in event and audit rows (SEC-CORE-07); one audit row per added user shows the set growing. */
async function recordAdded(
  ctx: RequestContext,
  tx: DbExecutor,
  id: string,
  { verticalId, members }: Locked,
  added: readonly string[],
  method: 'SELF' | 'MANAGER',
) {
  const running = [...members];
  for (const userId of added) {
    const before = [...running];
    running.push(userId);
    await appendEvent(tx, ctx, {
      type: 'vacancy.recruiter_assigned',
      subjectType: 'vacancy',
      subjectId: id,
      verticalId,
      vacancyId: id,
      payload: { userId, by: ctx.auth.userId, method },
    });
    await writeAudit(tx, ctx, {
      action: 'vacancy.recruiter_assigned',
      entityType: 'vacancy',
      entityId: id,
      before: { recruiterIds: before },
      after: { recruiterIds: [...running] },
    });
  }
}

/** D1/D130: first claim wins, judged on the locked recruiter set, so it never needs the caller's version. */
export async function claimVacancy(
  ctx: RequestContext,
  rawId: string,
  input: unknown,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.self_assign')) throw new ForbiddenError();
  await consumeVacancyWriteLimit(ctx);
  claimVacancySchema.parse(input);
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  const me = ctx.auth.userId;
  return ctx.db.transaction(async (tx) => {
    const locked = await lockTeam(ctx, tx, id, [], (auth, verticalId) =>
      grantCovers(auth, 'vacancy.self_assign', verticalId),
    );
    const { authors, fresh, members, row, verticalId } = locked;
    if (!authors.isEligibleRecruiter(me, verticalId))
      throw new ForbiddenError();
    if (members.includes(me)) return readVacancy(fresh, tx, id);
    if (row.status !== 'OPEN') throw new ConflictError('VACANCY_CLOSED');
    if (members.length > 0) throw new ConflictError('VACANCY_ALREADY_ASSIGNED');
    await insertRecruiters(tx, id, [me], me, ctx.clock.now());
    await bumpVersion(ctx, tx, id, locked);
    await recordAdded(ctx, tx, id, locked, [me], 'SELF');
    return readVacancy(fresh, tx, id);
  });
}

const canManage = (auth: AuthContext, verticalId: VerticalId) =>
  hasGrantCovering(auth, 'vacancy.assign_recruiters', verticalId);

export async function assignVacancyRecruiters(
  ctx: RequestContext,
  rawId: string,
  input: AssignVacancyRecruitersInput,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.assign_recruiters'))
    throw new ForbiddenError();
  await consumeVacancyWriteLimit(ctx);
  const body = assignVacancyRecruitersSchema.parse(input);
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  return ctx.db.transaction(async (tx) => {
    const locked = await lockTeam(ctx, tx, id, body.recruiterIds, canManage);
    assertEditable(locked);
    // Ids already assigned are skipped and not re-checked, so a retry after the assignee was deactivated stays a no-op.
    const added = body.recruiterIds.filter(
      (userId) => !locked.members.includes(userId),
    );
    if (
      added.some(
        (userId) =>
          !locked.authors.isEligibleRecruiter(userId, locked.verticalId),
      )
    )
      throw new ValidationError([
        { path: 'body.recruiterIds', code: 'invalid_recruiter' },
      ]);
    assertVersion(locked, body.expectedVersion);
    if (added.length === 0) return readVacancy(locked.fresh, tx, id);
    await insertRecruiters(tx, id, added, ctx.auth.userId, ctx.clock.now());
    await bumpVersion(ctx, tx, id, locked);
    await recordAdded(ctx, tx, id, locked, added, 'MANAGER');
    return readVacancy(locked.fresh, tx, id);
  });
}

export async function unassignVacancyRecruiter(
  ctx: RequestContext,
  rawId: string,
  rawUserId: string,
  input: UnassignVacancyRecruiterQuery,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.assign_recruiters'))
    throw new ForbiddenError();
  await consumeVacancyWriteLimit(ctx);
  const query = unassignVacancyRecruiterQuerySchema.parse(input);
  const id = uuidOf(rawId);
  const userId = uuidOf(rawUserId);
  if (!id || !userId) throw new NotFoundError();
  return ctx.db.transaction(async (tx) => {
    const locked = await lockTeam(ctx, tx, id, [], canManage);
    assertEditable(locked);
    assertVersion(locked, query.expectedVersion);
    if (!locked.members.includes(userId))
      return readVacancy(locked.fresh, tx, id);
    await deleteRecruiter(tx, id, userId);
    await bumpVersion(ctx, tx, id, locked);
    await appendEvent(tx, ctx, {
      type: 'vacancy.recruiter_unassigned',
      subjectType: 'vacancy',
      subjectId: id,
      verticalId: locked.verticalId,
      vacancyId: id,
      payload: { userId, by: ctx.auth.userId },
    });
    await writeAudit(tx, ctx, {
      action: 'vacancy.recruiter_unassigned',
      entityType: 'vacancy',
      entityId: id,
      before: { recruiterIds: locked.members },
      after: { recruiterIds: locked.members.filter((m) => m !== userId) },
    });
    return readVacancy(locked.fresh, tx, id);
  });
}

/** Picker for the assign dialog: gate order 403 (no grant anywhere) → 404 (scoped read) → 403 (covering grant) → 409 (not editable); the vertical comes from the vacancy, never from the client. */
export async function listAssignableRecruiters(
  ctx: RequestContext,
  rawId: string,
): Promise<AssignableRecruiters> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.assign_recruiters'))
    throw new ForbiddenError();
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  const view = await readVacancy(ctx, ctx.db, id);
  if (!canManage(ctx.auth, view.vertical.id)) throw new ForbiddenError();
  if (!isTeamEditable(view.status)) throw new ConflictError('VACANCY_CLOSED');
  return {
    items: await findAssignableRecruiters(ctx.db, id, view.vertical.id),
  };
}
