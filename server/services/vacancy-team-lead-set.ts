import type { VacancyDetail } from '../../lib/schemas/vacancy';
import {
  setVacancyTeamLeadSchema,
  type SetVacancyTeamLeadInput,
} from '../../lib/schemas/vacancy-team-lead';
import { writeAudit } from '../audit';
import { hasAnyGrant, requirePermission } from '../authz/can';
import type { VerticalId } from '../authz/types';
import { hasGrantCovering, isTeamEditable } from '../authz/vacancy-assignment';
import type { RequestContext } from '../context/request-context';
import { appendEvent } from '../events';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../http/errors';
import { uuidOf } from '../http/params';
import { lockVacancy, updateVacancy } from '../repositories/vacancy';
import { consumeVacancyWriteLimit, lockAuthors, readVacancy } from './vacancy';

const PERMISSION = 'vacancy.team_lead.set';

/**
 * D130 (3): only the first Team Lead assignment exists in Phase 2. Judged on the locked row in ADR-017 order: status,
 * already set, eligibility on fresh role rows (D122), then version, so a stale caller learns the real reason first.
 */
export async function setVacancyTeamLead(
  ctx: RequestContext,
  rawId: string,
  input: SetVacancyTeamLeadInput,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  if (!hasAnyGrant(ctx.auth, PERMISSION)) throw new ForbiddenError();
  await consumeVacancyWriteLimit(ctx);
  const body = setVacancyTeamLeadSchema.parse(input);
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  return ctx.db.transaction(async (tx) => {
    const current = await readVacancy(ctx, tx, id);
    const verticalId: VerticalId = current.vertical.id;
    if (!hasGrantCovering(ctx.auth, PERMISSION, verticalId))
      throw new ForbiddenError();
    // Users before the vacancy (ADR-012 lock order); a grant withdrawn while waiting is 403.
    const authors = await lockAuthors(ctx, tx, [body.teamLeadId]);
    if (!hasGrantCovering(authors.auth, PERMISSION, verticalId))
      throw new ForbiddenError();
    const row = await lockVacancy(tx, id);
    if (!row || row.deletedAt) throw new NotFoundError();
    if (!isTeamEditable(row.status)) throw new ConflictError('VACANCY_CLOSED');
    const freshCtx = { ...ctx, auth: authors.auth };
    if (row.teamLeadId === body.teamLeadId)
      return readVacancy(freshCtx, tx, id);
    if (row.teamLeadId !== null)
      throw new ConflictError('TEAM_LEAD_ALREADY_SET');
    if (!authors.isEligibleTeamLead(body.teamLeadId, verticalId))
      throw new ValidationError([
        { path: 'body.teamLeadId', code: 'invalid_team_lead' },
      ]);
    if (row.version !== body.expectedVersion)
      throw new ConflictError('STALE_STATE');

    const applied = await updateVacancy(
      tx,
      id,
      { status: row.status, version: row.version },
      { teamLeadId: body.teamLeadId },
      ctx.clock.now(),
    );
    if (!applied) throw new ConflictError('STALE_STATE');
    await appendEvent(tx, ctx, {
      type: 'vacancy.team_lead_assigned',
      subjectType: 'vacancy',
      subjectId: id,
      verticalId,
      vacancyId: id,
      payload: { teamLeadId: body.teamLeadId, by: ctx.auth.userId },
    });
    await writeAudit(tx, ctx, {
      action: 'vacancy.team_lead_assigned',
      entityType: 'vacancy',
      entityId: id,
      before: { teamLeadId: null },
      after: { teamLeadId: body.teamLeadId },
    });
    return readVacancy(freshCtx, tx, id);
  });
}
