import { randomUUID } from 'node:crypto';
import {
  IDEMPOTENCY_TTL_MS,
  idempotencyKeySchema,
} from '../../lib/idempotency';
import {
  createVacancySchema,
  formatVacancyNumber,
  vacancyListQuerySchema,
  VACANCY_DAILY_CREATE_LIMIT,
  VACANCY_DRAFT_LIMIT,
  VACANCY_WRITE_RATE_LIMIT,
  type CreateVacancyBody,
  type CreateVacancyInput,
  type VacancyDetail,
  type VacancyListQuery,
  type VacancyPage,
} from '../../lib/schemas/vacancy';
import { writeAudit } from '../audit';
import { buildAuthContext, type AuthContext } from '../authz/context';
import { can, hasAnyGrant, requirePermission } from '../authz/can';
import {
  isTeamLeadAssignment,
  type UserId,
  type VerticalId,
} from '../authz/types';
import {
  grantCovers,
  vacancyAuthorKind,
  type VacancyAuthorKind,
} from '../authz/vacancy-author';
import {
  findVisibleVacancyOrThrow,
  vacancyReadWhere,
} from '../authz/vacancy-scope';
import { rateLimitSecret } from '../config/runtime';
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
import { claimIdempotencyKey } from '../repositories/idempotency';
import { listRoleAssignments, lockUsersShared } from '../repositories/user';
import { verticalExists } from '../repositories/vertical';
import {
  countLiveDrafts,
  findVacancy,
  insertVacancy,
  insertVacancyRecruiter,
  listVacancies,
  type VacancySummaryRow,
} from '../repositories/vacancy';
import { requestHash } from '../security/idempotency';
import {
  consumeRateLimit,
  consumeSearchRateLimit,
} from '../security/rate-limit';
import { assertPositionUsable } from './position';

function present<T extends VacancySummaryRow>({
  publicNo,
  openedAt,
  createdAt,
  updatedAt,
  ...rest
}: T) {
  return {
    ...rest,
    number: formatVacancyNumber(BigInt(publicNo)),
    openedAt: openedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export async function listVacancyPage(
  ctx: RequestContext,
  input: VacancyListQuery,
): Promise<VacancyPage> {
  requirePermission(ctx.auth, 'vacancy.read');
  const filters = vacancyListQuerySchema.parse(input);
  if (filters.q) await consumeSearchRateLimit(ctx, rateLimitSecret());
  const result = await listVacancies(
    ctx.db,
    vacancyReadWhere(ctx.auth, filters.status),
    filters,
  );
  const first = result.items[0];
  const last = result.items.at(-1);
  return {
    items: result.items.map((row) => present(row)),
    nextCursor: result.hasOlder && last ? last.publicNo : null,
    prevCursor: result.hasNewer && first ? first.publicNo : null,
  };
}

async function readVacancy(
  ctx: RequestContext,
  db: DbExecutor,
  id: string,
): Promise<VacancyDetail> {
  return present(
    await findVisibleVacancyOrThrow(ctx.auth, (scope) =>
      findVacancy(db, scope, id),
    ),
  );
}

export async function getVacancyDetail(
  ctx: RequestContext,
  rawId: string,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  return readVacancy(ctx, ctx.db, id);
}

const CREATE_OPERATION = 'vacancy.create';

/**
 * Who may create this vacancy with these fields; run before the transaction for a fast refusal and again inside it on
 * role rows read after the users were locked, so a role removed meanwhile cannot slip through (ADR-012).
 */
function authorizeCreate(
  auth: AuthContext,
  body: CreateVacancyBody,
  verticalId: VerticalId,
): VacancyAuthorKind {
  if (!can(auth, 'vertical.read', { type: 'vertical', id: verticalId }))
    throw new NotFoundError();
  const kind = vacancyAuthorKind(auth, verticalId);
  if (!kind) throw new ForbiddenError();
  if (
    (body.teamLeadId &&
      !grantCovers(auth, 'vacancy.team_lead.set', verticalId)) ||
    (body.probationDays !== undefined &&
      !grantCovers(auth, 'vacancy.probation_length.set', verticalId))
  )
    throw new ForbiddenError();
  return kind;
}

/**
 * D89/D92: Admin, Head Recruiter and Recruiter publish (OPEN, opening date = now) or save a private DRAFT. The key row,
 * users, position and vacancy are written in one transaction with locks in the order users (stable id) → position →
 * vacancy. A DRAFT writes no audit row so the Admin audit viewer cannot reveal it (D92); its entity events are
 * author-only for the future timeline reader.
 */
export async function createVacancy(
  ctx: RequestContext,
  input: CreateVacancyInput,
  rawKey: string,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.create')) throw new ForbiddenError();
  await consumeRateLimit(
    ctx.db,
    ctx.clock.now(),
    rateLimitSecret(),
    [
      {
        namespace: 'vacancy:write:user',
        value: ctx.auth.userId,
        limit: VACANCY_WRITE_RATE_LIMIT.perUser,
      },
    ],
    VACANCY_WRITE_RATE_LIMIT.windowSeconds,
  );
  await consumeRateLimit(
    ctx.db,
    ctx.clock.now(),
    rateLimitSecret(),
    [
      {
        namespace: 'vacancy:create:day',
        value: ctx.auth.userId,
        limit: VACANCY_DAILY_CREATE_LIMIT.perUser,
      },
    ],
    VACANCY_DAILY_CREATE_LIMIT.windowSeconds,
  );
  const key = idempotencyKeySchema.parse(rawKey);
  const body = createVacancySchema.parse(input);
  const verticalId = body.verticalId as VerticalId;
  authorizeCreate(ctx.auth, body, verticalId);
  const teamLeadId = body.teamLeadId ?? null;

  const now = ctx.clock.now();
  const published = body.mode === 'PUBLISH';
  const vacancyId = randomUUID();
  const hash = requestHash(body);
  return ctx.db.transaction(async (tx) => {
    const claim = await claimIdempotencyKey(tx, {
      userId: ctx.auth.userId,
      operation: CREATE_OPERATION,
      key,
      requestHash: hash,
      resourceId: vacancyId,
      now,
      expiredBefore: new Date(now.getTime() - IDEMPOTENCY_TTL_MS),
    });
    if (claim.replayed) {
      if (claim.requestHash !== hash)
        throw new ConflictError('IDEMPOTENCY_KEY_REUSED');
      return readVacancy(ctx, tx, claim.resourceId);
    }
    if (!(await verticalExists(tx, verticalId))) throw new NotFoundError();
    const involved = [
      ...new Set([ctx.auth.userId, ...(teamLeadId ? [teamLeadId] : [])]),
    ].sort();
    const locked = await lockUsersShared(tx, involved);
    const roles = await listRoleAssignments(tx, involved);
    if (!locked.some((user) => user.id === ctx.auth.userId && user.isActive))
      throw new ForbiddenError();
    const kind = authorizeCreate(
      buildAuthContext({
        userId: ctx.auth.userId as UserId,
        roles: roles.filter((role) => role.userId === ctx.auth.userId),
        aal: ctx.auth.aal,
        timezone: ctx.auth.timezone,
      }),
      body,
      verticalId,
    );
    if (
      teamLeadId &&
      !(
        locked.some((user) => user.id === teamLeadId && user.isActive) &&
        roles.some(
          (role) =>
            role.userId === teamLeadId &&
            isTeamLeadAssignment(role) &&
            role.verticalId === verticalId,
        )
      )
    )
      throw new ValidationError([
        { path: 'body.teamLeadId', code: 'invalid_team_lead' },
      ]);
    if (
      !published &&
      (await countLiveDrafts(tx, ctx.auth.userId)) >= VACANCY_DRAFT_LIMIT
    )
      throw new ConflictError('DRAFT_LIMIT_REACHED');
    if (body.positionId)
      await assertPositionUsable(ctx, tx, body.positionId, verticalId);
    const status = published ? 'OPEN' : 'DRAFT';
    const recruiterInitiated = teamLeadId === null;
    const created = await insertVacancy(tx, {
      id: vacancyId,
      verticalId,
      positionId: body.positionId ?? null,
      title: body.title,
      teamLeadId,
      recruiterInitiated,
      status,
      headcount: body.headcount ?? 1,
      seniority: body.seniority ?? null,
      workFormat: body.workFormat ?? null,
      employmentType: body.employmentType ?? null,
      location: body.location ?? null,
      salaryMinMinor:
        body.salaryMinMinor == null ? null : BigInt(body.salaryMinMinor),
      salaryMaxMinor:
        body.salaryMaxMinor == null ? null : BigInt(body.salaryMaxMinor),
      salaryCurrency: body.salaryCurrency ?? null,
      priorityFlag: body.priority ?? 'NORMAL',
      probationDays: body.probationDays ?? 90,
      source: 'APP',
      descriptionDoc: body.descriptionDoc ?? null,
      requirementsDoc: body.requirementsDoc ?? null,
      openedAt: published ? now : null,
      createdBy: ctx.auth.userId,
      createdAt: now,
    });
    const assigned = kind === 'SELF_ASSIGNER';
    if (assigned)
      await insertVacancyRecruiter(tx, {
        vacancyId,
        userId: ctx.auth.userId,
        assignedBy: ctx.auth.userId,
        assignedAt: now,
      });
    const subject = {
      subjectType: 'vacancy',
      subjectId: vacancyId,
      verticalId,
      vacancyId,
    } as const;
    await appendEvent(tx, ctx, {
      ...subject,
      type: 'vacancy.created',
      payload: {
        number: created.publicNo.toString(),
        status,
        source: 'APP',
        recruiterInitiated,
      },
    });
    if (assigned)
      await appendEvent(tx, ctx, {
        ...subject,
        type: 'vacancy.recruiter_assigned',
        payload: { userId: ctx.auth.userId },
      });
    if (published)
      await writeAudit(tx, ctx, {
        action: 'vacancy.created',
        entityType: 'vacancy',
        entityId: vacancyId,
        after: {
          number: formatVacancyNumber(created.publicNo),
          status,
          title: body.title,
          verticalId,
          positionId: body.positionId,
          teamLeadId,
          recruiterInitiated,
          headcount: body.headcount ?? 1,
          priority: body.priority ?? 'NORMAL',
          source: 'APP',
        },
      });
    return readVacancy(ctx, tx, vacancyId);
  });
}
