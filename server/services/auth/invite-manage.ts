import { writeAudit } from '@/server/audit';
import { requirePermission } from '@/server/authz/can';
import { INVITE_TTL_MS, generateInviteToken } from '@/server/auth/invite-token';
import type { RequestContext } from '@/server/context/request-context';
import type { DbExecutor } from '@/server/db';
import {
  changeUserEmailSchema,
  type ChangeUserEmailInput,
} from '@/lib/schemas/user';
import { pgErrorInfo } from '@/server/db/errors';
import { appendEvent, USER_SUBJECT } from '@/server/events';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/http/errors';
import { userIdOf } from '@/server/http/params';
import {
  findLatestInviteStatus,
  findUserById,
  insertInvite,
  listCurrentRoles,
  lockInvitee,
  lockPendingInvite,
  revokePendingInvites,
  rotatePendingInvite,
  updateUserEmail,
} from '@/server/repositories/auth';
import type { AuthDependencies } from './deps';
import { emailTakenCode, rolesAreValid, sendInviteEmail } from './invite';

export interface InviteSent {
  inviteId: string;
  expiresAt: string;
  delivered: boolean;
}

function targetUserId(ctx: RequestContext, rawUserId: string): string {
  requirePermission(ctx.auth, 'settings.users.manage');
  const userId = userIdOf(rawUserId);
  if (!userId) throw new NotFoundError();
  return userId;
}

/** Current assignments decide what the invite grants; an invite without valid roles could never be accepted (ROLE-05-2). */
async function currentInviteRoles(db: DbExecutor, userId: string) {
  const roles = (await listCurrentRoles(db, userId)).map(
    ({ role, verticalId }) => ({ role, verticalId }),
  );
  if (!(await rolesAreValid(db, roles)))
    throw new ConflictError('INVITE_ROLES_INVALID');
  return roles;
}

/**
 * «Надіслати повторно» (STORY-ROLE-05-3): a new 72 h token replaces the old hash, so the previous link
 * stops working at commit. A concurrent acceptance of the old token loses if this rotation commits first.
 */
export async function resendInvite(
  deps: AuthDependencies,
  ctx: RequestContext,
  rawUserId: string,
): Promise<InviteSent> {
  const userId = targetUserId(ctx, rawUserId);
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const { token, hash } = generateInviteToken();
  const result = await ctx.db.transaction(async (tx) => {
    const rotated = await rotatePendingInvite(tx, {
      userId,
      tokenHash: hash,
      sentAt: now,
      expiresAt,
    });
    const user = await findUserById(tx, userId);
    if (!user) throw new NotFoundError();
    if (!rotated) throw new ConflictError('INVITE_NOT_PENDING');
    await currentInviteRoles(tx, userId);
    const write = { ...ctx, db: tx };
    await appendEvent(tx, write, {
      type: 'user.invite_resent',
      subjectType: USER_SUBJECT,
      subjectId: userId,
      payload: { inviteId: rotated.id },
    });
    await writeAudit(tx, write, {
      action: 'user.invite_resent',
      entityType: 'user',
      entityId: userId,
      details: { inviteId: rotated.id, resendCount: rotated.resendCount },
    });
    return { inviteId: rotated.id, user };
  });
  const delivered = await sendInviteEmail(deps, result.user, token, expiresAt);
  return {
    inviteId: result.inviteId,
    expiresAt: expiresAt.toISOString(),
    delivered,
  };
}

/** «Відкликати» (STORY-ROLE-05-3): the pending invite (fresh or expired) becomes REVOKED; accepted ones are never touched. */
export async function revokeInvite(
  ctx: RequestContext,
  rawUserId: string,
): Promise<{ inviteId: string; revokedAt: string }> {
  const userId = targetUserId(ctx, rawUserId);
  const now = ctx.clock.now();
  const inviteId = await ctx.db.transaction(async (tx) => {
    const [revoked] = await revokePendingInvites(
      tx,
      userId,
      ctx.auth.userId,
      now,
      { activeInviteeOnly: true },
    );
    if (!revoked) {
      if (!(await findUserById(tx, userId))) throw new NotFoundError();
      throw new ConflictError('INVITE_NOT_PENDING');
    }
    const write = { ...ctx, db: tx };
    await appendEvent(tx, write, {
      type: 'user.invite_revoked',
      subjectType: USER_SUBJECT,
      subjectId: userId,
      payload: { inviteId: revoked.id },
    });
    await writeAudit(tx, write, {
      action: 'user.invite_revoked',
      entityType: 'user',
      entityId: userId,
      details: { inviteId: revoked.id },
    });
    return revoked.id;
  });
  return { inviteId, revokedAt: now.toISOString() };
}

/**
 * «Запросити знову» (D70): only for an active, never-activated user whose latest invite was revoked.
 * A new pending invite with the user's current roles; older rows stay REVOKED, so their links stay dead.
 */
export async function reinviteUser(
  deps: AuthDependencies,
  ctx: RequestContext,
  rawUserId: string,
): Promise<InviteSent> {
  const userId = targetUserId(ctx, rawUserId);
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const { token, hash } = generateInviteToken();
  const result = await ctx.db.transaction(async (tx) => {
    const user = await lockInvitee(tx, userId);
    if (!user) throw new NotFoundError();
    if (!user.isActive) throw new ConflictError('USER_DEACTIVATED');
    if (user.activatedAt) throw new ConflictError('USER_EXISTS');
    const latest = await findLatestInviteStatus(tx, userId);
    if (latest === 'PENDING') throw new ConflictError('INVITE_ALREADY_PENDING');
    if (latest !== 'REVOKED') throw new ConflictError('INVITE_NOT_REVOKED');
    const roles = await currentInviteRoles(tx, userId);
    const inviteId = await insertInvite(tx, {
      userId,
      tokenHash: hash,
      roles,
      invitedBy: ctx.auth.userId,
      sentAt: now,
      expiresAt,
    });
    const write = { ...ctx, db: tx };
    await appendEvent(tx, write, {
      type: 'user.reinvited',
      subjectType: USER_SUBJECT,
      subjectId: userId,
      payload: { inviteId, roles },
    });
    await writeAudit(tx, write, {
      action: 'user.reinvited',
      entityType: 'user',
      entityId: userId,
      after: { roles },
      details: { inviteId },
    });
    return { inviteId, user };
  });
  const delivered = await sendInviteEmail(deps, result.user, token, expiresAt);
  return {
    inviteId: result.inviteId,
    expiresAt: expiresAt.toISOString(),
    delivered,
  };
}

/** Marks the conflict as «address taken» so the UI tells it apart from a change in the user's own state. */
const emailTaken = (code: string) =>
  new ConflictError(code, [{ path: 'body.email', code: 'taken' }]);

/**
 * «Змінити email» (STORY-ROLE-05-7, D69) for an active, never-activated user: in one transaction the
 * pending invite (fresh or expired) is revoked, the address replaced and a new 72 h invite with the
 * current roles created; the letter goes to the new address after commit, nothing to the old one.
 */
export async function changeInviteeEmail(
  deps: AuthDependencies,
  ctx: RequestContext,
  rawUserId: string,
  input: ChangeUserEmailInput,
): Promise<InviteSent> {
  const userId = targetUserId(ctx, rawUserId);
  const { email, expectedVersion } = changeUserEmailSchema.parse(input);
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const { token, hash } = generateInviteToken();
  const run = () =>
    ctx.db.transaction(async (tx) => {
      await lockPendingInvite(tx, userId);
      const user = await lockInvitee(tx, userId);
      if (!user) throw new NotFoundError();
      if (user.activatedAt) throw new ConflictError('USER_ACTIVATED');
      if (!user.isActive) throw new ConflictError('USER_DEACTIVATED');
      // A second Admin working from the same card loses instead of overwriting the first change (ADR-006).
      if (user.version !== expectedVersion)
        throw new ConflictError('STALE_STATE');
      if (user.email === email)
        throw new ValidationError(
          [{ path: 'body.email', code: 'unchanged' }],
          'EMAIL_UNCHANGED',
        );
      const roles = await currentInviteRoles(tx, userId);
      const taken = await emailTakenCode(tx, email);
      if (taken) throw emailTaken(taken);
      const [revoked] = await revokePendingInvites(
        tx,
        userId,
        ctx.auth.userId,
        now,
      );
      await updateUserEmail(tx, userId, email, now);
      const inviteId = await insertInvite(tx, {
        userId,
        tokenHash: hash,
        roles,
        invitedBy: ctx.auth.userId,
        sentAt: now,
        expiresAt,
      });
      const revokedInviteId = revoked?.id ?? null;
      const write = { ...ctx, db: tx };
      await appendEvent(tx, write, {
        type: 'user.email_changed',
        subjectType: USER_SUBJECT,
        subjectId: userId,
        payload: { inviteId, revokedInviteId, roles },
        pii: { email: { old: user.email, new: email } },
      });
      await writeAudit(tx, write, {
        action: 'user.email_changed',
        entityType: 'user',
        entityId: userId,
        before: { email: user.email },
        after: { email },
        details: { inviteId, revokedInviteId },
      });
      return { inviteId, fullName: user.fullName };
    });
  let result: Awaited<ReturnType<typeof run>>;
  try {
    result = await run();
  } catch (error) {
    // Someone took the address between our check and the write (e.g. a parallel invite): same answer as a sequential retry.
    const pg = pgErrorInfo(error);
    if (pg?.sqlState === '23505' && pg.constraint === 'app_user_email_uq')
      throw emailTaken('INVITE_PENDING');
    throw error;
  }
  const delivered = await sendInviteEmail(
    deps,
    { email, fullName: result.fullName },
    token,
    expiresAt,
  );
  return {
    inviteId: result.inviteId,
    expiresAt: expiresAt.toISOString(),
    delivered,
  };
}
