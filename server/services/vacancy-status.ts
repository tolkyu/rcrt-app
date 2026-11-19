import type { VacancyDetail } from '../../lib/schemas/vacancy';
import {
  changeVacancyStatusSchema,
  type ChangeVacancyStatusInput,
} from '../../lib/schemas/vacancy-status';
import { writeAudit } from '../audit';
import { hasAnyGrant, requirePermission } from '../authz/can';
import type { VerticalId } from '../authz/types';
import { mayRequestStatusAction } from '../authz/vacancy-status';
import type { RequestContext } from '../context/request-context';
import {
  isRepeat,
  transitionTarget,
  VACANCY_TRANSITIONS,
  type VacancyStatusAction,
} from '../domain/vacancy-status/transitions';
import { appendEvent } from '../events';
import { ConflictError, ForbiddenError, NotFoundError } from '../http/errors';
import { uuidOf } from '../http/params';
import { lockVacancy, updateVacancy } from '../repositories/vacancy';
import { consumeVacancyWriteLimit, lockAuthors, readVacancy } from './vacancy';

const holdsAnyStatusGrant = (ctx: RequestContext) =>
  Object.values(VACANCY_TRANSITIONS).some(({ permission }) =>
    hasAnyGrant(ctx.auth, permission),
  );

/**
 * ADR-017 / D130: the table decides legality, authz decides the actor. Under the lock the order is grant (fresh roles, locked
 * Team Lead) → repeat → legality → version, so a repeat never masks a denial and a stale caller learns the real reason.
 */
export async function changeVacancyStatus(
  ctx: RequestContext,
  rawId: string,
  input: ChangeVacancyStatusInput,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!holdsAnyStatusGrant(ctx)) throw new ForbiddenError();
  await consumeVacancyWriteLimit(ctx);
  const body = changeVacancyStatusSchema.parse(input);
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  const action: VacancyStatusAction = body.action;
  return ctx.db.transaction(async (tx) => {
    const current = await readVacancy(ctx, tx, id);
    const verticalId: VerticalId = current.vertical.id;
    if (
      !mayRequestStatusAction(
        ctx.auth,
        { verticalId, teamLeadId: current.teamLead?.id ?? null },
        action,
      )
    )
      throw new ForbiddenError();
    // A role withdrawn after the context was built is access revoked (403), not a missing object.
    const authors = await lockAuthors(ctx, tx, []);
    const row = await lockVacancy(tx, id);
    if (!row || row.deletedAt) throw new NotFoundError();
    if (!mayRequestStatusAction(authors.auth, { ...row, verticalId }, action))
      throw new ForbiddenError();
    const freshCtx = { ...ctx, auth: authors.auth };
    const headcount = body.action === 'REOPEN' ? body.headcount : undefined;
    // A repeat that carries a headcount would drop it silently, so it is a conflict.
    if (isRepeat(row.status, action) && headcount === undefined)
      return readVacancy(freshCtx, tx, id);
    const target = transitionTarget(row.status, action);
    if (target === null) throw new ConflictError('VACANCY_STATUS_INVALID');
    if (row.version !== body.expectedVersion)
      throw new ConflictError('STALE_STATE');

    const now = ctx.clock.now();
    const closing = target === 'CANCELLED';
    const headcountChanged =
      headcount !== undefined && headcount !== row.headcount;
    const applied = await updateVacancy(
      tx,
      id,
      { status: row.status, version: row.version },
      {
        status: target,
        closedAt: closing ? now : null,
        ...(closing ? { cancelledAt: now } : {}),
        ...(headcount === undefined ? {} : { headcount }),
      },
      now,
    );
    if (!applied) throw new ConflictError('STALE_STATE');
    const reason = body.action === 'CANCEL' ? body.reason : null;
    const subject = {
      subjectType: 'vacancy',
      subjectId: id,
      verticalId,
      vacancyId: id,
    } as const;
    await appendEvent(tx, ctx, {
      ...subject,
      type: 'vacancy.status_changed',
      payload: { from: row.status, to: target },
      ...(reason === null ? {} : { pii: { reason } }),
    });
    if (headcountChanged)
      await appendEvent(tx, ctx, {
        ...subject,
        type: 'vacancy.updated',
        payload: { fields: ['headcount'] },
      });
    await writeAudit(tx, ctx, {
      action: 'vacancy.status_changed',
      entityType: 'vacancy',
      entityId: id,
      before: {
        status: row.status,
        ...(headcountChanged ? { headcount: row.headcount } : {}),
      },
      after: {
        status: target,
        ...(headcountChanged ? { headcount } : {}),
      },
    });
    const view = await readVacancy(freshCtx, tx, id);
    return reason === null ? view : { ...view, cancelReason: reason };
  });
}
