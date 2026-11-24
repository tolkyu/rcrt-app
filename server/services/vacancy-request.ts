import { randomUUID } from 'node:crypto';
import {
  IDEMPOTENCY_TTL_MS,
  idempotencyKeySchema,
} from '../../lib/idempotency';
import { plainTextToDoc } from '../../lib/plain-text-doc';
import {
  formatVacancyNumber,
  type VacancyDetail,
} from '../../lib/schemas/vacancy';
import {
  requestVacancySchema,
  type RequestVacancyInput,
} from '../../lib/schemas/vacancy-request';
import { VACANCY_PROBATION_DEFAULT } from '../../lib/vacancy-options';
import { writeAudit } from '../audit';
import { canRequestVacancy, requestsAnywhere } from '../authz/vacancy-request';
import type { RequestContext } from '../context/request-context';
import { appendEvent } from '../events';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../http/errors';
import { claimIdempotencyKey } from '../repositories/idempotency';
import { lockPositionShared } from '../repositories/position';
import { insertVacancy } from '../repositories/vacancy';
import { vacancyRequestRecipients } from '../repositories/vacancy-request';
import { requestHash } from '../security/idempotency';
import {
  consumeVacancyCreateLimits,
  lockAuthors,
  readVacancy,
} from './vacancy';

export async function requestVacancy(
  ctx: RequestContext,
  input: RequestVacancyInput,
  rawKey: string,
): Promise<VacancyDetail> {
  if (!requestsAnywhere(ctx.auth)) throw new NotFoundError();
  await consumeVacancyCreateLimits(ctx);
  const key = idempotencyKeySchema.parse(rawKey);
  const body = requestVacancySchema.parse(input);
  const now = ctx.clock.now();
  const vacancyId = randomUUID();
  const hash = requestHash(body);
  return ctx.db.transaction(async (tx) => {
    const claim = await claimIdempotencyKey(tx, {
      userId: ctx.auth.userId,
      operation: 'vacancy.request',
      key,
      requestHash: hash,
      resourceId: vacancyId,
      now,
      expiredBefore: new Date(now.getTime() - IDEMPOTENCY_TTL_MS),
    });
    const authors = await lockAuthors(ctx, tx, []);
    // The role was withdrawn after the request context was built: access revoked, not a missing object.
    if (!requestsAnywhere(authors.auth)) throw new ForbiddenError();
    const freshCtx = { ...ctx, auth: authors.auth };
    if (claim.replayed) {
      if (claim.requestHash !== hash)
        throw new ConflictError('IDEMPOTENCY_KEY_REUSED');
      return readVacancy(freshCtx, tx, claim.resourceId);
    }
    const position = await lockPositionShared(tx, body.positionId);
    if (!position || !canRequestVacancy(authors.auth, position.verticalId))
      throw new NotFoundError();
    const verticalId = position.verticalId;
    if (!authors.isEligibleTeamLead(ctx.auth.userId, verticalId))
      throw new ForbiddenError();
    if (!position.isActive)
      throw new ValidationError([
        { path: 'body.positionId', code: 'position_inactive' },
      ]);
    const created = await insertVacancy(tx, {
      id: vacancyId,
      verticalId,
      positionId: position.id,
      title: position.name,
      teamLeadId: ctx.auth.userId,
      recruiterInitiated: false,
      status: 'OPEN',
      headcount: body.headcount,
      priorityFlag: body.priority,
      probationDays: VACANCY_PROBATION_DEFAULT,
      source: 'APP',
      descriptionDoc: body.comment ? plainTextToDoc(body.comment) : null,
      requirementsDoc: null,
      seniority: null,
      workFormat: null,
      employmentType: null,
      location: null,
      salaryMinMinor: null,
      salaryMaxMinor: null,
      salaryCurrency: null,
      openedAt: now,
      createdBy: ctx.auth.userId,
      createdAt: now,
    });
    const recipientUserIds = await vacancyRequestRecipients(
      tx,
      verticalId,
      ctx.auth.userId,
    );
    await appendEvent(tx, freshCtx, {
      subjectType: 'vacancy',
      subjectId: vacancyId,
      vacancyId,
      verticalId,
      type: 'vacancy.created',
      payload: {
        number: created.publicNo.toString(),
        status: 'OPEN',
        source: 'APP',
        recruiterInitiated: false,
        recipientUserIds,
      },
    });
    await writeAudit(tx, freshCtx, {
      action: 'vacancy.created',
      entityType: 'vacancy',
      entityId: vacancyId,
      after: {
        number: formatVacancyNumber(created.publicNo),
        status: 'OPEN',
        title: position.name,
        verticalId,
        positionId: position.id,
        teamLeadId: ctx.auth.userId,
        recruiterInitiated: false,
        headcount: body.headcount,
        priority: body.priority,
        source: 'APP',
      },
    });
    return readVacancy(freshCtx, tx, vacancyId);
  });
}
