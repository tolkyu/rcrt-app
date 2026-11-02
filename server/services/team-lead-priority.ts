import type { RoleAssignmentRef } from '../../lib/role-diff';
import {
  updateTeamLeadPrioritiesSchema,
  type TeamLeadPriorityVerticals,
  type UpdateTeamLeadPrioritiesInput,
  type VerticalTeamLeadPriorities,
} from '../../lib/schemas/team-lead-priority';
import { writeAudit } from '../audit';
import { requirePermission } from '../authz/can';
import { isTeamLeadAssignment } from '../authz/types';
import type { RequestContext, WriteContext } from '../context/request-context';
import { appendEvent, USER_SUBJECT } from '../events';
import { ConflictError, NotFoundError } from '../http/errors';
import { uuidOf } from '../http/params';
import {
  deleteTeamLeadPriority,
  deleteUserTeamLeadPriorities,
  findVerticalTeamLeads,
  insertTeamLeadPriority,
  listVerticalsByName,
  lockTeamLeadEligibility,
  lockTeamLeadPriorityRows,
  nextTeamLeadPriorityVersion,
  priorityVerticalExists,
  updateTeamLeadPriority,
} from '../repositories/team-lead-priority';

/** Vertical tabs of «Пріоритети тімлідів»: every vertical, the permission is GLOBAL (Admin, aal2). */
export async function listTeamLeadPriorityVerticals(
  ctx: RequestContext,
): Promise<TeamLeadPriorityVerticals> {
  requirePermission(ctx.auth, 'settings.priorities.manage');
  return { items: await listVerticalsByName(ctx.db) };
}

/** STORY-ROLE-01-3: active, invite-accepted Team Leads of one vertical with their priority; invitees with a live invite are counted; unknown vertical → 404. */
export async function getVerticalTeamLeadPriorities(
  ctx: RequestContext,
  rawVerticalId: string,
): Promise<VerticalTeamLeadPriorities> {
  requirePermission(ctx.auth, 'settings.priorities.manage');
  const verticalId = uuidOf(rawVerticalId);
  if (!verticalId) throw new NotFoundError();
  const row = await findVerticalTeamLeads(ctx.db, verticalId, ctx.clock.now());
  if (!row) throw new NotFoundError();
  return {
    vertical: { id: row.id, name: row.name },
    items: row.items,
    pendingInvites: row.pendingInvites,
  };
}

/** D73: the change shows in the Team Lead's own «Історія» and as one audit row on the vertical. */
async function recordPriorityChange(
  ctx: WriteContext,
  verticalId: string,
  userId: string,
  old: number | null,
  next: number | null,
) {
  await appendEvent(ctx.db, ctx, {
    type: 'vertical.tl_priority_changed',
    subjectType: USER_SUBJECT,
    subjectId: userId,
    verticalId,
    payload: { userId, old, new: next },
  });
  await writeAudit(ctx.db, ctx, {
    action: 'vertical.tl_priority_changed',
    entityType: 'vertical',
    entityId: verticalId,
    before: { priority: old },
    after: { priority: next },
    details: { teamLead: userId },
  });
}

/**
 * Batched save, all or nothing (wireframe P1.1 #12): users are locked first in UUID order and eligibility
 * is rechecked on a fresh snapshot (SEC-TLP-01); any stale, unexpected or ineligible row → 409 STALE_STATE.
 * Row versions come from the user's monotonic counter, so a cleared and recreated row never reuses one (SEC-TLP-02).
 */
export async function updateTeamLeadPriorities(
  ctx: RequestContext,
  rawVerticalId: string,
  input: UpdateTeamLeadPrioritiesInput,
): Promise<VerticalTeamLeadPriorities> {
  requirePermission(ctx.auth, 'settings.priorities.manage');
  const verticalId = uuidOf(rawVerticalId);
  if (!verticalId) throw new NotFoundError();
  const { changes } = updateTeamLeadPrioritiesSchema.parse(input);
  return ctx.db.transaction(async (tx) => {
    if (!(await priorityVerticalExists(tx, verticalId)))
      throw new NotFoundError();
    const userIds = changes.map((change) => change.userId);
    const eligible = await lockTeamLeadEligibility(tx, verticalId, userIds);
    if (
      eligible.length !== userIds.length ||
      eligible.some((row) => !row.eligible)
    )
      throw new ConflictError('STALE_STATE');
    const current = new Map(
      (await lockTeamLeadPriorityRows(tx, verticalId, userIds)).map((row) => [
        row.userId,
        row,
      ]),
    );
    if (
      changes.some(
        (change) =>
          (current.get(change.userId)?.version ?? null) !== change.version,
      )
    )
      throw new ConflictError('STALE_STATE');
    const write = { ...ctx, db: tx };
    const now = ctx.clock.now();
    for (const change of changes) {
      const previous = current.get(change.userId);
      const old = previous?.priority ?? null;
      if (old === change.priority) continue;
      const version = await nextTeamLeadPriorityVersion(
        tx,
        change.userId,
        previous?.version ?? 0,
        now,
      );
      if (change.priority === null)
        await deleteTeamLeadPriority(tx, verticalId, change.userId);
      else {
        const row = {
          verticalId,
          userId: change.userId,
          priority: change.priority,
          version,
        };
        if (previous)
          await updateTeamLeadPriority(tx, row, ctx.auth.userId, now);
        else await insertTeamLeadPriority(tx, row, ctx.auth.userId, now);
      }
      await recordPriorityChange(
        write,
        verticalId,
        change.userId,
        old,
        change.priority,
      );
    }
    return getVerticalTeamLeadPriorities(write, verticalId);
  });
}

/**
 * TEAM_LEAD removal (role edit, reactivation without it) drops the priority in the caller's user-locked
 * transaction and keeps old→null in history; deactivation does not call this, so the row survives it.
 */
export async function removeTeamLeadPriorities(
  ctx: WriteContext,
  userId: string,
  removed: readonly RoleAssignmentRef[],
) {
  const verticalIds = removed.flatMap((role) =>
    isTeamLeadAssignment(role) && role.verticalId ? [role.verticalId] : [],
  );
  if (!verticalIds.length) return;
  const rows = await deleteUserTeamLeadPriorities(ctx.db, userId, verticalIds);
  for (const row of rows)
    await recordPriorityChange(ctx, row.verticalId, userId, row.priority, null);
}
