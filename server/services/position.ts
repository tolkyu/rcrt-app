import { and } from 'drizzle-orm';
import { positionNameKey } from '../../lib/position-name';
import {
  createPositionSchema,
  patchPositionSchema,
  POSITION_LIST_LIMIT,
  POSITION_PER_VERTICAL_LIMIT,
  POSITION_WRITE_RATE_LIMIT,
  positionListQuerySchema,
  type CreatePositionInput,
  type PatchPositionInput,
  type Position,
  type PositionList,
  type PositionListQuery,
} from '../../lib/schemas/position';
import { writeAudit } from '../audit';
import { assertCan, can, hasAnyGrant, requirePermission } from '../authz/can';
import { findVisibleOrThrow, positionScope, scopeWhere } from '../authz/scopes';
import type { VerticalId } from '../authz/types';
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
import {
  countPositions,
  insertPosition,
  listPositions,
  lockPosition,
  lockPositionShared,
  lockVerticalForCatalog,
  updatePosition,
  type PositionRow,
} from '../repositories/position';
import { consumeRateLimit } from '../security/rate-limit';

/** Not a `DomainError`: it maps to the 500 path, whose log line carries only the error name (no PII). */
export class PositionListOverflowError extends Error {
  constructor() {
    super('Position catalog exceeds the list limit');
    this.name = 'PositionListOverflowError';
  }
}

function toPosition(
  row: PositionRow,
  openVacanciesCount: number | null,
): Position {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    openVacanciesCount,
  };
}

/**
 * Pickers (`active`) use the `position.read` scope; the manager list (`all`) is read AND manage scope, the only
 * one that carries inactive rows and vacancy counts, so a manage grant never widens what the caller may read (ADR-013).
 */
export async function listPositionCatalog(
  ctx: RequestContext,
  input: PositionListQuery,
): Promise<PositionList> {
  requirePermission(ctx.auth, 'position.read');
  const { verticalId, status } = positionListQuerySchema.parse(input);
  const managerView = status === 'all';
  if (managerView && !hasAnyGrant(ctx.auth, 'position.manage'))
    throw new ForbiddenError();
  const rows = await listPositions(
    ctx.db,
    managerView
      ? and(
          scopeWhere(ctx.auth, 'position.read', positionScope),
          scopeWhere(ctx.auth, 'position.manage', positionScope),
        )!
      : scopeWhere(ctx.auth, 'position.read', positionScope),
    { verticalId, activeOnly: !managerView, withCounts: managerView },
  );
  if (rows.length > POSITION_LIST_LIMIT) throw new PositionListOverflowError();
  return {
    items: rows.map(({ openVacanciesCount, ...row }) =>
      toPosition(row, openVacanciesCount),
    ),
  };
}

type PositionChange =
  | 'position.created'
  | 'position.renamed'
  | 'position.deactivated'
  | 'position.reactivated';
type AuditValues = Readonly<Record<string, string | boolean>>;

/** Names live only in audit before/after, never in event payloads (SEC-CORE-07). */
async function record(
  tx: DbExecutor,
  ctx: RequestContext,
  row: Pick<PositionRow, 'id' | 'verticalId'>,
  type: PositionChange,
  values: { readonly before?: AuditValues; readonly after: AuditValues },
) {
  await writeAudit(tx, ctx, {
    action: type,
    entityType: 'position',
    entityId: row.id,
    ...(values.before ? { before: values.before } : {}),
    after: values.after,
  });
  await appendEvent(tx, ctx, {
    type,
    subjectType: 'position',
    subjectId: row.id,
    verticalId: row.verticalId,
    payload: {},
  });
}

/** Permission-before-input (SEC-POS-04), repeated from the route's `requireGrant` because services are callable without a route; the throttle counts every call that reaches the service (route-level 400s never do). */
async function admitWrite(ctx: RequestContext) {
  requirePermission(ctx.auth, 'position.read');
  if (!hasAnyGrant(ctx.auth, 'position.manage')) throw new ForbiddenError();
  await consumeRateLimit(
    ctx.db,
    ctx.clock.now(),
    rateLimitSecret(),
    [
      {
        namespace: 'position:write:user',
        value: ctx.auth.userId,
        limit: POSITION_WRITE_RATE_LIMIT.perUser,
      },
    ],
    POSITION_WRITE_RATE_LIMIT.windowSeconds,
  );
}

/**
 * D76: the unique `(vertical_id, name_key)` index is the only arbiter of duplicates, so parallel creates have one
 * winner (409 POSITION_NAME_TAKEN); the vertical row lock makes the size cap exact (SEC-POS-03).
 */
export async function createPosition(
  ctx: RequestContext,
  input: CreatePositionInput,
): Promise<Position> {
  await admitWrite(ctx);
  const { verticalId, name } = createPositionSchema.parse(input);
  const resource = { type: 'vertical', id: verticalId as VerticalId } as const;
  if (!can(ctx.auth, 'position.read', resource)) throw new NotFoundError();
  assertCan(ctx.auth, 'position.manage', resource);
  const row = await ctx.db.transaction(async (tx) => {
    if (!(await lockVerticalForCatalog(tx, verticalId)))
      throw new NotFoundError();
    if ((await countPositions(tx, verticalId)) >= POSITION_PER_VERTICAL_LIMIT)
      throw new ConflictError('POSITION_LIMIT_REACHED');
    const created = await insertPosition(tx, {
      verticalId,
      name,
      nameKey: positionNameKey(name),
      createdBy: ctx.auth.userId,
      now: ctx.clock.now(),
    });
    await record(tx, ctx, created, 'position.created', {
      after: { name, isActive: true, verticalId },
    });
    return created;
  });
  return toPosition(row, null);
}

/** Rename, deactivate and reactivate share one version bump; a request that changes nothing writes nothing. */
export async function patchPosition(
  ctx: RequestContext,
  positionId: string,
  input: PatchPositionInput,
): Promise<Position> {
  await admitWrite(ctx);
  const { expectedVersion, name, isActive } = patchPositionSchema.parse(input);
  const row = await ctx.db.transaction(async (tx) => {
    const current = await findVisibleOrThrow(
      ctx.auth,
      'position.read',
      positionScope,
      (scope) => lockPosition(tx, scope, positionId),
    );
    assertCan(ctx.auth, 'position.manage', {
      type: 'vertical',
      id: current.verticalId as VerticalId,
    });
    if (current.version !== expectedVersion)
      throw new ConflictError('STALE_STATE');
    const renamed = name !== undefined && name !== current.name;
    const toggled = isActive !== undefined && isActive !== current.isActive;
    if (!renamed && !toggled) return current;
    const updated = await updatePosition(
      tx,
      positionId,
      {
        ...(renamed ? { name, nameKey: positionNameKey(name) } : {}),
        ...(toggled ? { isActive } : {}),
      },
      ctx.clock.now(),
    );
    if (renamed)
      await record(tx, ctx, updated, 'position.renamed', {
        before: { name: current.name },
        after: { name: updated.name },
      });
    if (toggled)
      await record(
        tx,
        ctx,
        updated,
        updated.isActive ? 'position.reactivated' : 'position.deactivated',
        {
          before: { isActive: current.isActive },
          after: { isActive: updated.isActive },
        },
      );
    return updated;
  });
  return toPosition(row, null);
}

/**
 * Vacancy writes (V2b): the position must exist in the vacancy's own vertical within the caller's `position.read` scope
 * (otherwise a field error that does not tell foreign from unknown) and be active (409 POSITION_INACTIVE, ADR-013).
 * The shared row lock keeps a concurrent deactivation from slipping in before the vacancy is stored.
 */
export async function assertPositionUsable(
  ctx: RequestContext,
  tx: DbExecutor,
  positionId: string,
  verticalId: string,
): Promise<void> {
  const row = await lockPositionShared(tx, positionId);
  const field = [{ path: 'body.positionId', code: 'invalid_position' }];
  if (
    !row ||
    row.verticalId !== verticalId ||
    !can(ctx.auth, 'position.read', {
      type: 'vertical',
      id: row.verticalId as VerticalId,
    })
  )
    throw new ValidationError(field);
  if (!row.isActive)
    throw new ConflictError('POSITION_INACTIVE', [
      { path: 'body.positionId', code: 'position_inactive' },
    ]);
}
