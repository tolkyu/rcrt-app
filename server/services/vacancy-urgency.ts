import {
  setVacancyUrgencySchema,
  type SetVacancyUrgencyInput,
  type VacancyDetail,
} from '../../lib/schemas/vacancy';
import { isUrgencyChangeable } from '../../lib/vacancy-urgency';
import { writeAudit } from '../audit';
import { hasAnyGrant, requirePermission } from '../authz/can';
import type { VerticalId } from '../authz/types';
import { hasBroadUpdate } from '../authz/vacancy-urgency';
import type { RequestContext } from '../context/request-context';
import { appendEvent } from '../events';
import { ConflictError, ForbiddenError, NotFoundError } from '../http/errors';
import { uuidOf } from '../http/params';
import { lockVacancy, updateVacancy } from '../repositories/vacancy';
import { consumeVacancyWriteLimit, lockAuthors, readVacancy } from './vacancy';

/** D94/D127: judged on the locked row and enforced again by the compare-and-set; Team Lead priority tables are never touched (ROUTE-01). */
export async function setVacancyUrgency(
  ctx: RequestContext,
  rawId: string,
  input: SetVacancyUrgencyInput,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.update')) throw new ForbiddenError();
  await consumeVacancyWriteLimit(ctx);
  const body = setVacancyUrgencySchema.parse(input);
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  return ctx.db.transaction(async (tx) => {
    const current = await readVacancy(ctx, tx, id);
    const verticalId: VerticalId = current.vertical.id;
    if (!hasBroadUpdate(ctx.auth, verticalId)) throw new ForbiddenError();
    // A grant withdrawn after the request context was built: access revoked, not a missing object.
    const authors = await lockAuthors(ctx, tx, []);
    if (!hasBroadUpdate(authors.auth, verticalId)) throw new ForbiddenError();
    const row = await lockVacancy(tx, id);
    if (!row || row.deletedAt) throw new NotFoundError();
    if (!isUrgencyChangeable(row.status))
      throw new ConflictError('VACANCY_URGENCY_LOCKED');
    if (row.version !== body.expectedVersion)
      throw new ConflictError('STALE_STATE');
    const freshCtx = { ...ctx, auth: authors.auth };
    if (row.priorityFlag === body.priority)
      return readVacancy(freshCtx, tx, id);

    const applied = await updateVacancy(
      tx,
      id,
      { status: row.status, version: row.version },
      { priorityFlag: body.priority },
      ctx.clock.now(),
    );
    if (!applied) throw new ConflictError('STALE_STATE');
    await appendEvent(tx, ctx, {
      type: 'vacancy.urgency_changed',
      subjectType: 'vacancy',
      subjectId: id,
      verticalId,
      vacancyId: id,
      payload: { from: row.priorityFlag, to: body.priority },
    });
    await writeAudit(tx, ctx, {
      action: 'vacancy.urgency_changed',
      entityType: 'vacancy',
      entityId: id,
      before: { priority: row.priorityFlag },
      after: { priority: body.priority },
    });
    return readVacancy(freshCtx, tx, id);
  });
}
