import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../db';
import {
  appUser,
  auditLog,
  userInvite,
  userRole,
  userSession,
  vertical,
} from '../db/schema';

export type SessionMethod = (typeof userSession.$inferInsert)['method'];
export type SessionEndReason = NonNullable<
  (typeof userSession.$inferInsert)['endReason']
>;

/** Active, invite-accepted users with a linked auth identity are the only ones who may receive a link (SEC-AUTH-1). */
export async function findEligibleAuthUser(db: DbExecutor, email: string) {
  const [user] = await db
    .select({ id: appUser.id, authUserId: appUser.authUserId })
    .from(appUser)
    .where(
      and(
        eq(appUser.email, email),
        eq(appUser.isActive, true),
        isNotNull(appUser.activatedAt),
        isNotNull(appUser.authUserId),
      ),
    )
    .limit(1);
  return user?.authUserId ? { id: user.id, authUserId: user.authUserId } : null;
}

export async function findUserByAuthId(db: DbExecutor, authUserId: string) {
  const [user] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      isActive: appUser.isActive,
      activatedAt: appUser.activatedAt,
    })
    .from(appUser)
    .where(eq(appUser.authUserId, authUserId))
    .limit(1);
  return user ?? null;
}

export async function findUserByEmail(db: DbExecutor, email: string) {
  const [user] = await db
    .select({
      id: appUser.id,
      authUserId: appUser.authUserId,
      isActive: appUser.isActive,
      activatedAt: appUser.activatedAt,
    })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  return user ?? null;
}

export async function findUserById(db: DbExecutor, userId: string) {
  const [user] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
      authUserId: appUser.authUserId,
      isActive: appUser.isActive,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  return user ?? null;
}

export async function recordAuthLogin(
  db: DbExecutor,
  authUserId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(appUser)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(
      and(
        eq(appUser.authUserId, authUserId),
        eq(appUser.isActive, true),
        isNotNull(appUser.activatedAt),
      ),
    )
    .returning({ id: appUser.id });
  return rows.length === 1;
}

export async function insertUserSession(
  db: DbExecutor,
  input: {
    sessionId: string;
    userId: string;
    method: SessionMethod;
    now: Date;
    ip: string | null;
    userAgent: string | null;
    mfaVerifiedAt?: Date | null;
  },
): Promise<void> {
  await db
    .insert(userSession)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      method: input.method,
      startedAt: input.now,
      lastSeenAt: input.now,
      ip: input.ip,
      userAgent: input.userAgent,
      mfaVerifiedAt: input.mfaVerifiedAt ?? null,
    })
    .onConflictDoNothing({ target: userSession.sessionId });
}

/** Deletes Supabase sessions through the definer function, so refresh tokens die with them (T4-B04). */
export async function endAuthSessions(
  db: DbExecutor,
  authUserId: string,
  filter: { only?: string; except?: string } = {},
): Promise<number> {
  const [row] = await db.execute<{ count: number }>(
    sql`select app.end_auth_sessions(${authUserId}::uuid, ${filter.only ?? null}::uuid, ${filter.except ?? null}::uuid) as count`,
  );
  return Number(row?.count ?? 0);
}

export async function endUserSession(
  db: DbExecutor,
  sessionId: string,
  reason: SessionEndReason,
  now: Date,
): Promise<string | null> {
  const [row] = await db
    .update(userSession)
    .set({ endedAt: now, endReason: reason })
    .where(
      and(eq(userSession.sessionId, sessionId), isNull(userSession.endedAt)),
    )
    .returning({ userId: userSession.userId });
  return row?.userId ?? null;
}

/** Ends every open session of a user, optionally keeping the caller's own (SEC-AUTH-4). */
export async function endUserSessions(
  db: DbExecutor,
  userId: string,
  reason: SessionEndReason,
  now: Date,
  keepSessionId?: string,
): Promise<number> {
  const rows = await db
    .update(userSession)
    .set({ endedAt: now, endReason: reason })
    .where(
      and(
        eq(userSession.userId, userId),
        isNull(userSession.endedAt),
        keepSessionId ? ne(userSession.sessionId, keepSessionId) : undefined,
      ),
    )
    .returning({ sessionId: userSession.sessionId });
  return rows.length;
}

export async function listOpenSessions(
  db: DbExecutor,
  userId: string,
  idleSince: Date,
  startedSince: Date,
) {
  return db
    .select({
      sessionId: userSession.sessionId,
      method: userSession.method,
      startedAt: userSession.startedAt,
      lastSeenAt: userSession.lastSeenAt,
      userAgent: userSession.userAgent,
    })
    .from(userSession)
    .where(
      and(
        eq(userSession.userId, userId),
        isNull(userSession.endedAt),
        gt(userSession.lastSeenAt, idleSince),
        gt(userSession.startedAt, startedSince),
      ),
    )
    .orderBy(desc(userSession.lastSeenAt))
    .limit(50);
}

export const LOGIN_HISTORY_ACTIONS = [
  'auth.login_succeeded',
  'auth.login_failed',
  'auth.logged_out',
  'auth.session_revoked',
  'auth.mfa_challenge_failed',
] as const;

/** Own sign-in history, newest first, keyset-paginated on (occurred_at, id) via audit_log_entity_idx (AUD-3). */
export async function listLoginHistory(
  db: DbExecutor,
  userId: string,
  limit: number,
  cursor: { occurredAt: Date; id: bigint } | null,
) {
  return db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      result: auditLog.result,
      details: auditLog.details,
      ip: auditLog.ip,
      userAgent: auditLog.userAgent,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'user'),
        eq(auditLog.entityId, userId),
        inArray(auditLog.action, [...LOGIN_HISTORY_ACTIONS]),
        cursor
          ? or(
              lt(auditLog.occurredAt, cursor.occurredAt),
              and(
                eq(auditLog.occurredAt, cursor.occurredAt),
                lt(auditLog.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(limit + 1);
}

export async function findInviteByHash(
  db: DbExecutor,
  tokenHash: Buffer,
  forUpdate = false,
) {
  const query = db
    .select({
      id: userInvite.id,
      userId: userInvite.userId,
      status: userInvite.status,
      expiresAt: userInvite.expiresAt,
      email: appUser.email,
      fullName: appUser.fullName,
      isActive: appUser.isActive,
    })
    .from(userInvite)
    .innerJoin(appUser, eq(appUser.id, userInvite.userId))
    .where(eq(userInvite.tokenHash, tokenHash))
    .limit(1);
  const [row] = await (forUpdate ? query.for('update') : query);
  return row ?? null;
}

/** Acceptance holds current assignments until activation commits, so a concurrent removal cannot go stale. */
export async function lockCurrentRoles(db: DbExecutor, userId: string) {
  return db
    .select({ role: userRole.role, verticalId: userRole.verticalId })
    .from(userRole)
    .where(eq(userRole.userId, userId))
    .for('update');
}

export async function listCurrentRoles(db: DbExecutor, userId: string) {
  return db
    .select({
      role: userRole.role,
      verticalId: userRole.verticalId,
      verticalName: vertical.name,
    })
    .from(userRole)
    .leftJoin(vertical, eq(vertical.id, userRole.verticalId))
    .where(eq(userRole.userId, userId))
    .orderBy(userRole.role, vertical.name);
}

/** Atomic single use: only one concurrent caller gets the row back (DG-07, P1-04). */
export async function consumeInvite(
  db: DbExecutor,
  tokenHash: Buffer,
  now: Date,
) {
  const [row] = await db
    .update(userInvite)
    .set({
      status: 'ACCEPTED',
      acceptedAt: now,
      version: sql`${userInvite.version} + 1`,
    })
    .where(
      and(
        eq(userInvite.tokenHash, tokenHash),
        eq(userInvite.status, 'PENDING'),
        gt(userInvite.expiresAt, now),
      ),
    )
    .returning({ id: userInvite.id, userId: userInvite.userId });
  return row ?? null;
}

export async function activateInvitedUser(
  db: DbExecutor,
  input: { userId: string; authUserId: string; now: Date },
): Promise<boolean> {
  const rows = await db
    .update(appUser)
    .set({
      authUserId: input.authUserId,
      activatedAt: input.now,
      lastLoginAt: input.now,
      updatedAt: input.now,
      version: sql`${appUser.version} + 1`,
    })
    .where(
      and(
        eq(appUser.id, input.userId),
        eq(appUser.isActive, true),
        isNull(appUser.activatedAt),
        or(
          isNull(appUser.authUserId),
          eq(appUser.authUserId, input.authUserId),
        ),
      ),
    )
    .returning({ id: appUser.id });
  return rows.length === 1;
}

export async function insertInvitedUser(
  db: DbExecutor,
  input: {
    email: string;
    fullName: string;
    createdBy: string;
    now: Date;
  },
) {
  const [row] = await db
    .insert(appUser)
    .values({
      email: input.email,
      fullName: input.fullName,
      createdBy: input.createdBy,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: appUser.id });
  return row!.id;
}

export async function insertUserRoles(
  db: DbExecutor,
  userId: string,
  roles: readonly { role: string; verticalId: string | null }[],
  createdBy: string,
  now: Date,
) {
  return db
    .insert(userRole)
    .values(
      roles.map((role) => ({
        userId,
        role: role.role,
        verticalId: role.verticalId,
        createdBy,
        createdAt: now,
      })),
    )
    .returning({ id: userRole.id });
}

export async function insertInvite(
  db: DbExecutor,
  input: {
    userId: string;
    tokenHash: Buffer;
    roles: { role: string; verticalId: string | null }[];
    invitedBy: string;
    sentAt: Date;
    expiresAt: Date;
  },
) {
  const [row] = await db
    .insert(userInvite)
    .values({ ...input, createdAt: input.sentAt })
    .returning({ id: userInvite.id });
  return row!.id;
}

export async function findVerticalIds(db: DbExecutor, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: vertical.id })
    .from(vertical)
    .where(inArray(vertical.id, [...ids]));
}

export async function revokePendingInvites(
  db: DbExecutor,
  userId: string,
  revokedBy: string,
  now: Date,
) {
  return db
    .update(userInvite)
    .set({
      status: 'REVOKED',
      revokedAt: now,
      revokedBy,
      version: sql`${userInvite.version} + 1`,
    })
    .where(and(eq(userInvite.userId, userId), eq(userInvite.status, 'PENDING')))
    .returning({ id: userInvite.id });
}

export async function setMfaLock(
  db: DbExecutor,
  userId: string,
  until: Date | null,
): Promise<void> {
  await db
    .update(appUser)
    .set({ mfaLockedUntil: until })
    .where(eq(appUser.id, userId));
}

export async function lockMfaState(db: DbExecutor, userId: string) {
  const [row] = await db
    .select({ lockedUntil: appUser.mfaLockedUntil, isActive: appUser.isActive })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .for('update');
  return row ?? null;
}

export async function findSessionStart(
  db: DbExecutor,
  sessionId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: userSession.startedAt })
    .from(userSession)
    .where(eq(userSession.sessionId, sessionId))
    .limit(1);
  return row?.startedAt ?? null;
}

/** Records a TOTP verification done through our lockout-guarded API on an open session (SEC-AUTH-R02). */
export async function markSessionMfaVerified(
  db: DbExecutor,
  sessionId: string,
  userId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(userSession)
    .set({ mfaVerifiedAt: now })
    .where(
      and(
        eq(userSession.sessionId, sessionId),
        eq(userSession.userId, userId),
        isNull(userSession.endedAt),
      ),
    )
    .returning({ sessionId: userSession.sessionId });
  return rows.length > 0;
}
