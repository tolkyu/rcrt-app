import type {
  CreateVerticalInput,
  RenameVerticalInput,
  SettingsVertical,
  SettingsVerticalList,
  VerticalList,
} from '../../lib/schemas/vertical';
import {
  createVerticalSchema,
  renameVerticalSchema,
} from '../../lib/schemas/vertical';
import { writeAudit } from '../audit';
import { requirePermission } from '../authz/can';
import { scopeWhere, verticalScope } from '../authz/scopes';
import type { RequestContext } from '../context/request-context';
import { appendEvent } from '../events';
import { ConflictError, NotFoundError } from '../http/errors';
import {
  countActiveVerticalUsers,
  insertVertical,
  listVerticals,
  listVerticalsWithUserCounts,
  lockVertical,
  renameVertical as updateVerticalName,
} from '../repositories/vertical';

/** Admin sees every vertical; other roles only verticals where they hold a role; Finance gets 404 (VIS-02-1, FIN-03). */
export async function listVisibleVerticals(
  ctx: RequestContext,
): Promise<VerticalList> {
  requirePermission(ctx.auth, 'vertical.read');
  const items = await listVerticals(
    ctx.db,
    scopeWhere(ctx.auth, 'vertical.read', verticalScope),
  );
  return { items };
}

function toSettingsVertical(row: {
  id: string;
  name: string;
  createdAt: Date;
  version: number;
  usersCount: number;
}): SettingsVertical {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listSettingsVerticals(
  ctx: RequestContext,
): Promise<SettingsVerticalList> {
  requirePermission(ctx.auth, 'settings.verticals.manage');
  const rows = await listVerticalsWithUserCounts(ctx.db);
  return { items: rows.map(toSettingsVertical) };
}

/** STORY-ROLE-03-1: case-insensitive uniqueness is the `vertical_name_uq` index → 409 VERTICAL_NAME_TAKEN. */
export async function createVertical(
  ctx: RequestContext,
  input: CreateVerticalInput,
): Promise<SettingsVertical> {
  requirePermission(ctx.auth, 'settings.verticals.manage');
  const { name } = createVerticalSchema.parse(input);
  const row = await ctx.db.transaction(async (tx) => {
    const created = await insertVertical(tx, name, ctx.clock.now());
    await writeAudit(tx, ctx, {
      action: 'vertical.created',
      entityType: 'vertical',
      entityId: created.id,
      after: { name },
    });
    await appendEvent(tx, ctx, {
      type: 'vertical.created',
      subjectType: 'vertical',
      subjectId: created.id,
      verticalId: created.id,
      payload: {},
    });
    return created;
  });
  return toSettingsVertical({ ...row, usersCount: 0 });
}

/** Rename only — verticals are never deactivated or deleted (D34). Old→new name stays in the audit log. */
export async function renameVertical(
  ctx: RequestContext,
  verticalId: string,
  input: RenameVerticalInput,
): Promise<SettingsVertical> {
  requirePermission(ctx.auth, 'settings.verticals.manage');
  const { name, expectedVersion } = renameVerticalSchema.parse(input);
  const row = await ctx.db.transaction(async (tx) => {
    const current = await lockVertical(tx, verticalId);
    if (!current) throw new NotFoundError();
    if (current.version !== expectedVersion)
      throw new ConflictError('STALE_STATE');
    if (current.name === name) return current;
    const renamed = await updateVerticalName(
      tx,
      verticalId,
      name,
      ctx.clock.now(),
    );
    await writeAudit(tx, ctx, {
      action: 'vertical.renamed',
      entityType: 'vertical',
      entityId: verticalId,
      before: { name: current.name },
      after: { name },
    });
    await appendEvent(tx, ctx, {
      type: 'vertical.renamed',
      subjectType: 'vertical',
      subjectId: verticalId,
      verticalId,
      payload: {},
    });
    return renamed;
  });
  const usersCount = await countActiveVerticalUsers(ctx.db, verticalId);
  return toSettingsVertical({ ...row, usersCount });
}
