import { isDeepStrictEqual } from 'node:util';
import {
  IDEMPOTENCY_TTL_MS,
  idempotencyKeySchema,
} from '../../lib/idempotency';
import {
  cancelVacancySchema,
  patchVacancySchema,
  publishDraftSchema,
  salaryIssues,
  VACANCY_PROBATION_DEFAULT,
  type CancelVacancyInput,
  type PatchVacancyBody,
  type PatchVacancyInput,
  type PublishDraftInput,
  type VacancyDetail,
} from '../../lib/schemas/vacancy';
import { writeAudit } from '../audit';
import { requirePermission } from '../authz/can';
import type { VerticalId } from '../authz/types';
import { authorsAnywhere, vacancyAuthorKind } from '../authz/vacancy-author';
import type { RequestContext } from '../context/request-context';
import type { DbExecutor } from '../db';
import { appendEvent, VACANCY_EDIT_FIELDS, type EventDraft } from '../events';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../http/errors';
import { uuidOf } from '../http/params';
import { claimIdempotencyKey } from '../repositories/idempotency';
import {
  findVacancyState,
  lockVacancy,
  updateVacancy,
  type VacancyChanges,
  type VacancyLock,
} from '../repositories/vacancy';
import { requestHash } from '../security/idempotency';
import { assertPositionUsable } from './position';
import {
  authorizeAuthoring,
  consumeVacancyWriteLimit,
  lockAuthors,
  readVacancy,
  type VacancyView,
} from './vacancy';

const PUBLISH_OPERATION = 'vacancy.publish';
/** `vacancy_soft_delete_chk` demands a reason; an author discarding their own private draft gives none, so a fixed code stands in. */
const DRAFT_DELETE_REASON = 'draft_deleted_by_author';

/** Route gate shared by every draft action (D92): a caller who authors nowhere (HR, Team Lead, Finance, ...) gets the 404 of an unknown draft and learns nothing. */
function admit(ctx: RequestContext) {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!authorsAnywhere(ctx.auth)) throw new NotFoundError();
}

function draftId(rawId: string): string {
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  return id;
}

/** Unlocked read through the one read predicate; a visible vacancy that is no draft is 403 without an authoring role in its vertical, else 409 (VAC-08 edits opened ones). */
async function readDraft(
  ctx: RequestContext,
  tx: DbExecutor,
  id: string,
): Promise<VacancyView> {
  const current = await readVacancy(ctx, tx, id);
  if (current.status === 'DRAFT') return current;
  if (!vacancyAuthorKind(ctx.auth, current.vertical.id))
    throw new ForbiddenError();
  throw new ConflictError('VACANCY_NOT_DRAFT');
}

/** Only the author's live DRAFT passes; a foreign, deleted or missing row is one 404. */
function assertOwnDraft(
  ctx: RequestContext,
  state: {
    readonly status: string;
    readonly deletedAt: Date | null;
    readonly createdBy: string;
  },
) {
  if (state.deletedAt || state.createdBy !== ctx.auth.userId)
    throw new NotFoundError();
  if (state.status !== 'DRAFT') throw new ConflictError('VACANCY_NOT_DRAFT');
}

/** Row lock that makes a lifecycle write exact: state is judged on the locked row, so the second of two racing writers sees the first one's result. */
async function lockDraft(
  ctx: RequestContext,
  tx: DbExecutor,
  id: string,
  options: { readonly docs?: boolean } = {},
): Promise<VacancyLock> {
  const row = await lockVacancy(tx, id, options);
  if (!row) throw new NotFoundError();
  assertOwnDraft(ctx, row);
  return row;
}

/** Locks the caller (and `others`), proves they still author in the vertical on fresh role rows, and returns that authority. */
async function authorOf(
  ctx: RequestContext,
  tx: DbExecutor,
  verticalId: VerticalId,
  others: readonly string[] = [],
) {
  const authors = await lockAuthors(ctx, tx, others);
  if (!vacancyAuthorKind(authors.auth, verticalId)) throw new NotFoundError();
  return authors;
}

const invalidTeamLead = () =>
  new ValidationError([{ path: 'body.teamLeadId', code: 'invalid_team_lead' }]);

type EditField = (typeof VACANCY_EDIT_FIELDS)[number];

/** The editable columns and the event field name each one reports under; the single list the diff, the update and the event derive from. */
const COLUMN_FIELD = {
  title: 'title',
  positionId: 'positionId',
  teamLeadId: 'teamLeadId',
  headcount: 'headcount',
  seniority: 'seniority',
  workFormat: 'workFormat',
  employmentType: 'employmentType',
  location: 'location',
  salaryMinMinor: 'salary',
  salaryMaxMinor: 'salary',
  salaryCurrency: 'salary',
  priorityFlag: 'priority',
  probationDays: 'probationDays',
  descriptionDoc: 'descriptionDoc',
  requirementsDoc: 'requirementsDoc',
} as const satisfies Partial<Record<keyof VacancyChanges, EditField>>;
type EditableColumn = keyof typeof COLUMN_FIELD;
const EDITABLE_COLUMNS = Object.keys(COLUMN_FIELD) as EditableColumn[];
type Wanted = { [K in EditableColumn]: VacancyChanges[K] };

const minor = (value: string | null | undefined) =>
  value == null ? value : BigInt(value);

/** What the body asks for, per column; `undefined` keeps the stored value. */
function wantedBy(body: PatchVacancyBody): Wanted {
  return {
    title: body.title,
    positionId: body.positionId,
    teamLeadId: body.teamLeadId,
    headcount: body.headcount,
    seniority: body.seniority,
    workFormat: body.workFormat,
    employmentType: body.employmentType,
    location: body.location,
    salaryMinMinor: minor(body.salaryMinMinor),
    salaryMaxMinor: minor(body.salaryMaxMinor),
    salaryCurrency: body.salaryCurrency,
    priorityFlag: body.priority,
    probationDays: body.probationDays,
    descriptionDoc: body.descriptionDoc,
    requirementsDoc: body.requirementsDoc,
  };
}

/** The columns that really change, and the event field names they belong to in `VACANCY_EDIT_FIELDS` order. */
function diff(row: VacancyLock, wanted: Wanted) {
  const changes: VacancyChanges = {};
  const touched = new Set<EditField>();
  for (const column of EDITABLE_COLUMNS) {
    const value = wanted[column];
    if (value === undefined || isDeepStrictEqual(value, row[column])) continue;
    Object.assign(changes, { [column]: value });
    touched.add(COLUMN_FIELD[column]);
  }
  if (changes.teamLeadId !== undefined)
    changes.recruiterInitiated = changes.teamLeadId === null;
  return {
    changes,
    fields: VACANCY_EDIT_FIELDS.filter((field) => touched.has(field)),
  };
}

function keep<T>(next: T | undefined, current: T): T {
  return next === undefined ? current : next;
}

const text = (value: bigint | null) => value?.toString() ?? null;

/** Applies a lifecycle change to a draft whose row lock this transaction holds; a miss would mean the lock did not hold. */
async function saveDraftChanges(
  ctx: RequestContext,
  tx: DbExecutor,
  id: string,
  version: number,
  changes: VacancyChanges,
  now: Date,
) {
  const applied = await updateVacancy(
    tx,
    id,
    { status: 'DRAFT', version, authorId: ctx.auth.userId },
    changes,
    now,
  );
  if (!applied) throw new ConflictError('STALE_STATE');
}

/** D92/D98: edits only the author's own DRAFT, on the merged result; a stale version or a request that changes nothing writes nothing. */
export async function patchVacancyDraft(
  ctx: RequestContext,
  rawId: string,
  input: PatchVacancyInput,
): Promise<VacancyDetail> {
  admit(ctx);
  await consumeVacancyWriteLimit(ctx);
  const body = patchVacancySchema.parse(input);
  const id = draftId(rawId);
  const wanted = wantedBy(body);
  return ctx.db.transaction(async (tx) => {
    const current = await readDraft(ctx, tx, id);
    const verticalId = current.vertical.id;
    const authors = await authorOf(
      ctx,
      tx,
      verticalId,
      typeof body.teamLeadId === 'string' ? [body.teamLeadId] : [],
    );
    if (body.positionId && body.positionId !== current.position?.id)
      await assertPositionUsable(
        { ...ctx, auth: authors.auth },
        tx,
        body.positionId,
        verticalId,
      );
    const row = await lockDraft(ctx, tx, id, {
      docs:
        wanted.descriptionDoc !== undefined ||
        wanted.requirementsDoc !== undefined,
    });
    if (row.version !== body.expectedVersion)
      throw new ConflictError('STALE_STATE');

    const { changes, fields } = diff(row, wanted);
    authorizeAuthoring(authors.auth, verticalId, {
      setsTeamLead: changes.teamLeadId !== undefined,
      setsProbation: changes.probationDays !== undefined,
    });
    if (
      typeof changes.teamLeadId === 'string' &&
      !authors.isEligibleTeamLead(changes.teamLeadId, verticalId)
    )
      throw invalidTeamLead();
    const salary: { path: string }[] = [];
    salaryIssues(
      {
        salaryMinMinor: text(keep(changes.salaryMinMinor, row.salaryMinMinor)),
        salaryMaxMinor: text(keep(changes.salaryMaxMinor, row.salaryMaxMinor)),
        salaryCurrency: keep(changes.salaryCurrency, row.salaryCurrency),
      },
      (path) => salary.push({ path }),
    );
    if (salary.length)
      throw new ValidationError(
        salary.map(({ path }) => ({
          path: `body.${path}`,
          code: 'invalid_salary',
        })),
      );
    if (fields.length === 0) return current;

    await saveDraftChanges(ctx, tx, id, row.version, changes, ctx.clock.now());
    await appendEvent(tx, ctx, {
      type: 'vacancy.updated',
      subjectType: 'vacancy',
      subjectId: id,
      verticalId: null,
      vacancyId: id,
      payload: { fields },
    });
    return readVacancy(ctx, tx, id);
  });
}

/** D92: `DRAFT → OPEN` by the author alone, as a compare-and-set on status, author and the version they last saw (SEC-VC-04). */
export async function publishVacancyDraft(
  ctx: RequestContext,
  rawId: string,
  rawKey: string,
  input: PublishDraftInput,
): Promise<VacancyDetail> {
  admit(ctx);
  await consumeVacancyWriteLimit(ctx);
  const key = idempotencyKeySchema.parse(rawKey);
  const { expectedVersion } = publishDraftSchema.parse(input);
  const id = draftId(rawId);
  const now = ctx.clock.now();
  const hash = requestHash({ vacancyId: id, expectedVersion });
  return ctx.db.transaction(async (tx) => {
    const claim = await claimIdempotencyKey(tx, {
      userId: ctx.auth.userId,
      operation: PUBLISH_OPERATION,
      key,
      requestHash: hash,
      resourceId: id,
      now,
      expiredBefore: new Date(now.getTime() - IDEMPOTENCY_TTL_MS),
    });
    if (claim.replayed) {
      if (claim.requestHash !== hash)
        throw new ConflictError('IDEMPOTENCY_KEY_REUSED');
      return readVacancy(ctx, tx, claim.resourceId);
    }
    const current = await readDraft(ctx, tx, id);
    if (current.version !== expectedVersion)
      throw new ConflictError('STALE_STATE');
    const verticalId = current.vertical.id;
    const leadId = current.teamLead?.id ?? null;
    const authors = await authorOf(ctx, tx, verticalId, leadId ? [leadId] : []);
    if (!current.position)
      throw new ValidationError([
        { path: 'body.positionId', code: 'required' },
      ]);
    await assertPositionUsable(
      { ...ctx, auth: authors.auth },
      tx,
      current.position.id,
      verticalId,
    );
    authorizeAuthoring(authors.auth, verticalId, {
      setsTeamLead: leadId !== null,
      setsProbation: current.probationDays !== VACANCY_PROBATION_DEFAULT,
    });
    if (leadId && !authors.isEligibleTeamLead(leadId, verticalId))
      throw invalidTeamLead();

    const opened = await updateVacancy(
      tx,
      id,
      { status: 'DRAFT', version: expectedVersion, authorId: ctx.auth.userId },
      { status: 'OPEN', openedAt: now },
      now,
    );
    if (!opened) {
      const state = await findVacancyState(tx, id);
      if (!state) throw new NotFoundError();
      assertOwnDraft(ctx, state);
      throw new ConflictError('STALE_STATE');
    }
    await appendEvent(tx, ctx, {
      type: 'vacancy.status_changed',
      subjectType: 'vacancy',
      subjectId: id,
      verticalId,
      vacancyId: id,
      payload: { from: 'DRAFT', to: 'OPEN' },
    });
    await writeAudit(tx, ctx, {
      action: 'vacancy.created',
      entityType: 'vacancy',
      entityId: id,
      before: { status: 'DRAFT' },
      after: {
        number: current.number,
        status: 'OPEN',
        title: current.title,
        verticalId,
        positionId: current.position.id,
        teamLeadId: leadId,
        recruiterInitiated: current.recruiterInitiated,
        headcount: current.headcount,
        priority: current.priority,
        source: current.source,
        createdBy: ctx.auth.userId,
        createdAt: current.createdAt,
        publishedFromDraft: true,
      },
    });
    return readVacancy(ctx, tx, id);
  });
}

/** Ends a draft's life under the same locks as every draft write; never an audit row, so the Admin viewer cannot reveal it (D92). */
async function closeDraft<T>(
  ctx: RequestContext,
  rawId: string,
  changes: (now: Date) => VacancyChanges,
  event: (id: string) => EventDraft,
  result: (tx: DbExecutor, id: string) => Promise<T>,
): Promise<T> {
  admit(ctx);
  await consumeVacancyWriteLimit(ctx);
  const id = draftId(rawId);
  return ctx.db.transaction(async (tx) => {
    const current = await readDraft(ctx, tx, id);
    await authorOf(ctx, tx, current.vertical.id);
    const row = await lockDraft(ctx, tx, id);
    const now = ctx.clock.now();
    await saveDraftChanges(ctx, tx, id, row.version, changes(now), now);
    await appendEvent(tx, ctx, event(id));
    return result(tx, id);
  });
}

const draftEvent = (id: string) =>
  ({
    subjectType: 'vacancy',
    subjectId: id,
    verticalId: null,
    vacancyId: id,
  }) as const;

/** `DRAFT → CANCELLED` (D82): closed now, kept for its author, never shown to anyone else; the reason stays in the purgeable side row. */
export async function cancelVacancyDraft(
  ctx: RequestContext,
  rawId: string,
  input: CancelVacancyInput,
): Promise<VacancyDetail> {
  const { reason } = cancelVacancySchema.parse(input);
  return closeDraft(
    ctx,
    rawId,
    (now) => ({ status: 'CANCELLED', closedAt: now, cancelledAt: now }),
    (id) => ({
      ...draftEvent(id),
      type: 'vacancy.status_changed',
      payload: { from: 'DRAFT', to: 'CANCELLED' },
      pii: { reason },
    }),
    (tx, id) => readVacancy(ctx, tx, id),
  );
}

/** Soft delete of the author's own draft (§12); a deleted draft is 404 for everyone, its author included, and its number is never reused. */
export async function deleteVacancyDraft(
  ctx: RequestContext,
  rawId: string,
): Promise<{ id: string }> {
  return closeDraft(
    ctx,
    rawId,
    (now) => ({
      deletedAt: now,
      deletedBy: ctx.auth.userId,
      deleteReason: DRAFT_DELETE_REASON,
    }),
    (id) => ({ ...draftEvent(id), type: 'vacancy.deleted', payload: {} }),
    async (_tx, id) => ({ id }),
  );
}
