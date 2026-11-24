import { isDeepStrictEqual } from 'node:util';
import { richTextDocSchema } from '../../lib/schemas/rich-text';
import {
  updateVacancyContentSchema,
  type VacancyContentRead,
  type UpdateVacancyContentInput,
  type VacancyContent,
} from '../../lib/schemas/vacancy-content';
import { writeAudit } from '../audit';
import { requirePermission } from '../authz/can';
import type { UserId, VerticalId } from '../authz/types';
import { canEditVacancyContent } from '../authz/vacancy-content';
import { findVisibleVacancyOrThrow } from '../authz/vacancy-scope';
import type { RequestContext } from '../context/request-context';
import { appendEvent, VACANCY_EDIT_FIELDS } from '../events';
import { ConflictError, ForbiddenError, NotFoundError } from '../http/errors';
import { uuidOf } from '../http/params';
import {
  findVacancyContent,
  lockVacancy,
  updateVacancy,
} from '../repositories/vacancy';
import { listRecruiterIds } from '../repositories/vacancy-recruiter';
import { consumeVacancyWriteLimit, lockAuthors, readVacancy } from './vacancy';

export async function getVacancyContent(
  ctx: RequestContext,
  rawId: string,
): Promise<VacancyContentRead> {
  requirePermission(ctx.auth, 'vacancy.read');
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  const row = await findVisibleVacancyOrThrow(ctx.auth, (scope) =>
    findVacancyContent(ctx.db, scope, id),
  );
  const canEditContent =
    (row.status === 'OPEN' || row.status === 'ON_HOLD') &&
    canEditVacancyContent(ctx.auth, {
      ...row,
      type: 'vacancy',
      neverOpened: row.openedAt === null,
      maxApplicationStage: null,
    });
  return {
    id: row.id,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    descriptionDoc: row.descriptionDoc,
    requirementsDoc: row.requirementsDoc,
    status: row.status,
    canEditContent,
  };
}

export async function updateVacancyContent(
  ctx: RequestContext,
  rawId: string,
  input: UpdateVacancyContentInput,
): Promise<VacancyContent> {
  requirePermission(ctx.auth, 'vacancy.read');
  await consumeVacancyWriteLimit(ctx);
  const body = updateVacancyContentSchema.parse(input);
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  return ctx.db.transaction(async (tx) => {
    await readVacancy(ctx, tx, id);
    const { auth } = await lockAuthors(ctx, tx, []);
    const row = await lockVacancy(tx, id, { docs: true });
    if (!row || row.deletedAt) throw new NotFoundError();
    const members = await listRecruiterIds(tx, id);
    // UUID columns and foreign keys validate these stored identity facts at the DB boundary.
    const verticalId = row.verticalId as VerticalId;
    if (
      !canEditVacancyContent(auth, {
        type: 'vacancy',
        id,
        verticalId,
        status: row.status,
        createdBy: row.createdBy as UserId,
        teamLeadId: row.teamLeadId as UserId | null,
        assignedRecruiterIds: members as UserId[],
        neverOpened: row.openedAt === null,
        recruiterInitiated: row.recruiterInitiated,
        maxApplicationStage: null,
      })
    )
      throw new ForbiddenError();
    if (row.status !== 'OPEN' && row.status !== 'ON_HOLD')
      throw new ConflictError('VACANCY_CONTENT_LOCKED');
    if (row.version !== body.expectedVersion)
      throw new ConflictError('STALE_STATE');

    const documents = {
      descriptionDoc: richTextDocSchema.nullable().parse(row.descriptionDoc),
      requirementsDoc: richTextDocSchema.nullable().parse(row.requirementsDoc),
    };
    const changes: Partial<typeof documents> = {};
    for (const field of ['descriptionDoc', 'requirementsDoc'] as const) {
      const value = body[field];
      if (value !== undefined && !isDeepStrictEqual(value, documents[field])) {
        changes[field] = value;
        documents[field] = value;
      }
    }
    const fields = VACANCY_EDIT_FIELDS.filter((field) =>
      Object.hasOwn(changes, field),
    );
    let version = row.version;
    let updatedAt = row.updatedAt;
    if (fields.length) {
      updatedAt = ctx.clock.now();
      if (
        !(await updateVacancy(
          tx,
          id,
          { status: row.status, version: body.expectedVersion },
          changes,
          updatedAt,
        ))
      )
        throw new ConflictError('STALE_STATE');
      version += 1;
      await appendEvent(tx, ctx, {
        type: 'vacancy.updated',
        subjectType: 'vacancy',
        subjectId: id,
        vacancyId: id,
        verticalId,
        payload: { fields },
      });
      await writeAudit(tx, ctx, {
        action: 'vacancy.updated',
        entityType: 'vacancy',
        entityId: id,
        before: { version: row.version },
        after: { version },
        details: { fields },
      });
    }
    await readVacancy({ ...ctx, auth }, tx, id);
    return { id, version, updatedAt: updatedAt.toISOString(), ...documents };
  });
}
