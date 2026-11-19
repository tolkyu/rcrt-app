import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  updateUserRolesSchema,
  userParamsSchema,
  userRolesUpdatedSchema,
} from '../../lib/schemas/user';
import { generateInviteToken } from '../../server/auth/invite-token';
import { hasAnyGrant } from '../../server/authz/can';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import {
  loadAuthContext,
  type RequestContext,
} from '../../server/context/request-context';
import type { VerifiedIdentity } from '../../server/context/identity';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { completeInviteGoogle } from '../../server/services/auth/invite';
import { getUserDetail, listUserEventPage } from '../../server/services/user';
import { updateUserRoles } from '../../server/services/user-roles';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const HOUR = 3_600_000;
const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 4, prepare: false });
const concurrentDb = drizzle(client, { schema });
let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await Promise.all([jwks.stop(), fixture.close(), client.end(), admin.end()]);
});

type FixtureArgs = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];
type Role = { role: string; verticalId: string | null };

/** `PUT /users/{id}/roles` through the real route factory, bound to the fixture transaction. */
function route({ ctx }: FixtureArgs, identity: VerifiedIdentity) {
  const defineRoute = createRouteFactory({
    db: () => ctx.db,
    clock: ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => identity,
  });
  const handler = defineRoute(
    {
      method: 'PUT',
      path: '/users/{userId}/roles',
      operationId: 'updateUserRoles',
      summary: 'Replace roles',
      tags: ['Users'],
      params: userParamsSchema,
      body: updateUserRolesSchema,
      response: userRolesUpdatedSchema,
      errors: [400, 404, 409],
    },
    (request, { params, body }) =>
      updateUserRoles(request, params.userId, body),
  );
  const putRaw = (userId: string, body: unknown) =>
    handler(
      new Request(`${TEST_APP_URL}/api/v1/users/${userId}/roles`, {
        method: 'PUT',
        headers: {
          origin: TEST_APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ userId }) },
    );
  return {
    putRaw,
    put: (userId: string, roles: Role[], expectedVersion = 1) =>
      putRaw(userId, { roles, expectedVersion }),
  };
}

async function asRole(
  args: FixtureArgs,
  role:
    | 'ADMIN'
    | 'HEAD_RECRUITER'
    | 'RECRUITER'
    | 'HEAD_HR'
    | 'HR'
    | 'TEAM_LEAD'
    | 'FINANCE',
  aal: 'aal1' | 'aal2' = 'aal2',
) {
  if (role !== 'RECRUITER')
    await args.ctx.db.insert(schema.userRole).values({
      userId: args.user.id,
      role,
      verticalId:
        role === 'ADMIN' || role === 'FINANCE' ? null : args.user.verticalId,
    });
  await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  return {
    ...route(args, identity),
    request: async (): Promise<RequestContext> => ({
      ...args.ctx,
      auth: await loadAuthContext(args.ctx.db, identity, args.ctx.clock),
      identity,
    }),
  };
}

/** An activated user with RECRUITER in the fixture vertical, signed in on its own session. */
async function member(args: FixtureArgs, roles?: Role[]) {
  const { ctx, user, provider } = args;
  const userId = randomUUID();
  const authUserId = randomUUID();
  const session = await provider.issueSession(authUserId);
  await ctx.db.insert(schema.appUser).values({
    id: userId,
    authUserId,
    email: `${userId}@fixture.test`,
    fullName: 'Ольга Мельник',
    activatedAt: ctx.clock.now(),
  });
  await ctx.db
    .insert(schema.userRole)
    .values(
      (roles ?? [{ role: 'RECRUITER', verticalId: user.verticalId }]).map(
        (r) => ({ userId, ...r }),
      ),
    );
  await ctx.db.insert(schema.userSession).values({
    sessionId: session.sessionId,
    userId,
    method: 'MAGIC_LINK',
    startedAt: ctx.clock.now(),
    lastSeenAt: ctx.clock.now(),
  });
  const identity: VerifiedIdentity = {
    authUserId,
    sessionId: session.sessionId,
    aal: 'aal1',
  };
  return {
    userId,
    nextRequestAuth: () => loadAuthContext(ctx.db, identity, ctx.clock),
  };
}

/** A never-activated user with RECRUITER and a pending invite whose token we know. */
async function invitee(args: FixtureArgs) {
  const { ctx, user } = args;
  const userId = randomUUID();
  const email = `${userId}@fixture.test`;
  const { token, hash } = generateInviteToken();
  const sentAt = ctx.clock.now();
  await ctx.db
    .insert(schema.appUser)
    .values({ id: userId, email, fullName: 'Марина Савчук' });
  await ctx.db
    .insert(schema.userRole)
    .values({ userId, role: 'RECRUITER', verticalId: user.verticalId });
  await ctx.db.insert(schema.userInvite).values({
    userId,
    tokenHash: hash,
    roles: [{ role: 'RECRUITER', verticalId: user.verticalId }],
    sentAt,
    expiresAt: new Date(sentAt.getTime() + 72 * HOUR),
    invitedBy: user.id,
  });
  return { userId, email, token };
}

const acceptInvite = (args: FixtureArgs, token: string, email: string) =>
  completeInviteGoogle(
    {
      auth: null,
      db: args.ctx.db,
      clock: args.ctx.clock,
      requestId: randomUUID(),
      ip: null,
      userAgent: null,
      mutationId: null,
    },
    token,
    { authUserId: randomUUID(), sessionId: randomUUID(), aal: 'aal1' },
    { email, verified: true },
  );

const rolesOf = async (args: FixtureArgs, userId: string) =>
  (
    await args.ctx.db
      .select({
        role: schema.userRole.role,
        verticalId: schema.userRole.verticalId,
      })
      .from(schema.userRole)
      .where(eq(schema.userRole.userId, userId))
  ).sort((a, b) => a.role.localeCompare(b.role));

const versionOf = async (args: FixtureArgs, userId: string) =>
  (
    await args.ctx.db
      .select({ version: schema.appUser.version })
      .from(schema.appUser)
      .where(eq(schema.appUser.id, userId))
  )[0]?.version;

const eventsOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select({
      type: schema.entityEvent.type,
      payload: schema.entityEvent.payload,
      actorId: schema.entityEvent.actorId,
    })
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.subjectId, userId))
    .orderBy(schema.entityEvent.id);

const auditsOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityType, 'user'),
        eq(schema.auditLog.entityId, userId),
      ),
    )
    .orderBy(schema.auditLog.id);

/** Committed Admins from other suites would otherwise count as «another active Admin». */
async function onlyAdminsAre(args: FixtureArgs, keep: string[]) {
  const now = args.ctx.clock.now();
  const holders = args.ctx.db
    .select({ id: schema.userRole.userId })
    .from(schema.userRole)
    .where(eq(schema.userRole.role, 'ADMIN'));
  await args.ctx.db
    .update(schema.appUser)
    .set({ isActive: false, deactivatedAt: now })
    .where(
      and(
        inArray(schema.appUser.id, holders),
        eq(schema.appUser.isActive, true),
        notInArray(schema.appUser.id, keep),
      ),
    );
}

async function expectUntouched(args: FixtureArgs, userId: string) {
  expect(await versionOf(args, userId)).toBe(1);
  expect(await rolesOf(args, userId)).toEqual([
    { role: 'RECRUITER', verticalId: args.user.verticalId },
  ]);
  expect(await eventsOf(args, userId)).toHaveLength(0);
  expect(await auditsOf(args, userId)).toHaveLength(0);
}

describe('Change roles: Admin with aal2 only [STORY-ROLE-01-1/01-2, VIS-02]', () => {
  it.each([
    'HEAD_RECRUITER',
    'RECRUITER',
    'HEAD_HR',
    'HR',
    'TEAM_LEAD',
    'FINANCE',
  ] as const)('answers 404 to %s and changes nothing', async (role) => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, role);
      const response = await put(target.userId, []);
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe('NOT_FOUND');
      await expectUntouched(args, target.userId);
    });
  });

  it('answers 401 MFA_REQUIRED to an aal1 Admin and changes nothing', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN', 'aal1');
      const response = await put(target.userId, []);
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('MFA_REQUIRED');
      await expectUntouched(args, target.userId);
    });
  });

  it('answers 404 for an unknown or malformed user id', async () => {
    await fixture.run(async (args) => {
      const { put } = await asRole(args, 'ADMIN');
      for (const id of [randomUUID(), 'not-a-uuid'])
        expect((await put(id, [])).status).toBe(404);
    });
  });
});

describe('Change roles: validation [STORY-ROLE-01-1 negatives, D40]', () => {
  it('rejects malformed bodies with 400 before any write', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { putRaw } = await asRole(args, 'ADMIN');
      for (const body of [
        {},
        { roles: [] },
        { roles: [], expectedVersion: 0 },
        { roles: 'ADMIN', expectedVersion: 1 },
        { roles: [{ role: 'ADMIN' }], expectedVersion: 1 },
        { roles: [{ role: 'RECRUITER', verticalId: 'x' }], expectedVersion: 1 },
        { roles: [], expectedVersion: 1, email: 'a@b.ua' },
      ])
        expect((await putRaw(target.userId, body)).status).toBe(400);
      await expectUntouched(args, target.userId);
    });
  });

  it.each([
    [
      'a vertical role without a vertical',
      { role: 'RECRUITER', verticalId: null },
    ],
    [
      'a global role with a vertical',
      { role: 'FINANCE', verticalId: 'fixture' },
    ],
    ['an unknown vertical', { role: 'TEAM_LEAD', verticalId: randomUUID() }],
    ['an unknown role', { role: 'OWNER', verticalId: null }],
  ])('rejects %s with 400 on body.roles', async (_case, extra) => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const role = {
        ...extra,
        verticalId:
          extra.verticalId === 'fixture'
            ? args.user.verticalId
            : extra.verticalId,
      };
      const response = await put(target.userId, [
        { role: 'RECRUITER', verticalId: args.user.verticalId },
        role,
      ]);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body.roles', code: 'invalid_roles' }],
      });
      await expectUntouched(args, target.userId);
    });
  });

  it('rejects a duplicate assignment and an unchanged set', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const recruiter = { role: 'RECRUITER', verticalId: args.user.verticalId };
      const duplicate = await put(target.userId, [recruiter, { ...recruiter }]);
      expect(duplicate.status).toBe(400);
      expect((await duplicate.json()).errors).toEqual([
        { path: 'body.roles', code: 'invalid_roles' },
      ]);
      const unchanged = await put(target.userId, [recruiter]);
      expect(unchanged.status).toBe(400);
      expect(await unchanged.json()).toMatchObject({
        code: 'ROLES_UNCHANGED',
        errors: [{ path: 'body.roles', code: 'unchanged' }],
      });
      await expectUntouched(args, target.userId);
    });
  });

  it('treats an uppercase UUID as the existing assignment without version or history churn', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(target.userId, [
        { role: 'RECRUITER', verticalId: args.user.verticalId.toUpperCase() },
      ]);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('ROLES_UNCHANGED');
      await expectUntouched(args, target.userId);
    });
  });

  it('canonicalises mixed-case UUIDs across different roles in the same vertical', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(target.userId, [
        { role: 'RECRUITER', verticalId: args.user.verticalId.toUpperCase() },
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
      ]);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        version: 2,
        added: [{ role: 'TEAM_LEAD', verticalId: args.user.verticalId }],
        removed: [],
      });
      expect(await rolesOf(args, target.userId)).toEqual([
        { role: 'RECRUITER', verticalId: args.user.verticalId },
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
      ]);
      expect(await eventsOf(args, target.userId)).toHaveLength(1);
      expect((await eventsOf(args, target.userId))[0]?.type).toBe(
        'user.role_assigned',
      );
    });
  });

  it('rejects the same role and vertical repeated with different UUID casing without a write', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(target.userId, [
        { role: 'RECRUITER', verticalId: args.user.verticalId },
        { role: 'RECRUITER', verticalId: args.user.verticalId.toUpperCase() },
      ]);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ path: 'body.roles', code: 'invalid_roles' }],
      });
      await expectUntouched(args, target.userId);
    });
  });
});

describe('Change roles: stored difference, timeline and audit [STORY-ROLE-01-1/01-2 AC]', () => {
  it('stores the new set, bumps the version and records one event per change plus one audit row', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put, request } = await asRole(args, 'ADMIN');
      const recruiter = { role: 'RECRUITER', verticalId: args.user.verticalId };
      const lead = { role: 'TEAM_LEAD', verticalId: args.user.verticalId };
      const finance = { role: 'FINANCE', verticalId: null };
      const response = await put(target.userId, [lead, finance]);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        version: 2,
        added: [lead, finance],
        removed: [recruiter],
      });
      expect(await rolesOf(args, target.userId)).toEqual([finance, lead]);
      expect(await eventsOf(args, target.userId)).toEqual([
        {
          type: 'user.role_removed',
          payload: { v: 1, ...recruiter },
          actorId: args.user.id,
        },
        {
          type: 'user.role_assigned',
          payload: { v: 1, ...lead },
          actorId: args.user.id,
        },
        {
          type: 'user.role_assigned',
          payload: { v: 1, ...finance },
          actorId: args.user.id,
        },
      ]);
      expect(await auditsOf(args, target.userId)).toEqual([
        {
          action: 'user.roles_changed',
          actorId: args.user.id,
          before: { roles: [recruiter] },
          after: { roles: [finance, lead] },
        },
      ]);
      const ctx = await request();
      const detail = await getUserDetail(ctx, target.userId);
      expect(detail).toMatchObject({ version: 2, mfaRequired: true });
      expect(detail.roles.map((r) => r.role)).toEqual(['TEAM_LEAD', 'FINANCE']);
      expect(detail.teamLeadPriorities).toHaveLength(1);
      const timeline = await listUserEventPage(ctx, target.userId, {});
      expect(timeline.items.map((e) => [e.type, e.roles?.[0]?.role])).toEqual([
        ['user.role_assigned', 'FINANCE'],
        ['user.role_assigned', 'TEAM_LEAD'],
        ['user.role_removed', 'RECRUITER'],
      ]);
    });
  });

  it('applies on the target’s next request without re-login; FINANCE grants wait for 2FA [STORY-SEC-AUTH-3]', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const before = await target.nextRequestAuth();
      expect(hasAnyGrant(before, 'vacancy.approve')).toBe(false);
      expect(before.mfaRequired).toBe(false);
      const response = await put(target.userId, [
        { role: 'HEAD_RECRUITER', verticalId: args.user.verticalId },
        { role: 'FINANCE', verticalId: null },
      ]);
      expect(response.status).toBe(200);
      const after = await target.nextRequestAuth();
      expect(hasAnyGrant(after, 'vacancy.approve')).toBe(true);
      expect(hasAnyGrant(after, 'vacancy.self_assign')).toBe(false);
      expect(after.mfaRequired).toBe(true);
      // FINANCE's global payout grant waits for aal2; only the vertical one from HEAD_RECRUITER is usable.
      expect(
        after.grants.get('bonus.payout_report.read')?.map((g) => g.scope.kind),
      ).toEqual(['VERTICAL']);
    });
  });

  it('leaves an active user with no roles when the last one is removed', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      expect((await put(target.userId, [])).status).toBe(200);
      expect(await rolesOf(args, target.userId)).toEqual([]);
      const auth = await target.nextRequestAuth();
      expect(auth.grants.size).toBe(0);
      const [audit] = await auditsOf(args, target.userId);
      expect(audit?.after).toEqual({ roles: [] });
    });
  });

  it('keeps a pending invite: without roles it cannot be accepted, with new roles it grants them [STORY-ROLE-05-2]', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await asRole(args, 'ADMIN');
      expect((await put(target.userId, [])).status).toBe(200);
      expect(await acceptInvite(args, target.token, target.email)).toBe(false);
      const lead = { role: 'TEAM_LEAD', verticalId: args.user.verticalId };
      expect((await put(target.userId, [lead], 2)).status).toBe(200);
      expect(await acceptInvite(args, target.token, target.email)).toBe(true);
      expect(await rolesOf(args, target.userId)).toEqual([lead]);
    });
  });

  it('lets an Admin change their own other roles', async () => {
    await fixture.run(async (args) => {
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(args.user.id, [
        { role: 'ADMIN', verticalId: null },
      ]);
      expect(response.status).toBe(200);
      expect(await rolesOf(args, args.user.id)).toEqual([
        { role: 'ADMIN', verticalId: null },
      ]);
    });
  });
});

describe('Change roles: refusals [STORY-ROLE-01-2 negatives, D45, ADR-006]', () => {
  it('answers 409 USER_DEACTIVATED for a deactivated user', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      await args.ctx.db
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: args.ctx.clock.now() })
        .where(eq(schema.appUser.id, target.userId));
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(target.userId, []);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('USER_DEACTIVATED');
      await expectUntouched(args, target.userId);
    });
  });

  it('answers 409 STALE_STATE when the card version is not the current one', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(target.userId, [], 2);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('STALE_STATE');
      await expectUntouched(args, target.userId);
    });
  });

  it('answers 409 SELF_ADMIN_REMOVAL when an Admin removes ADMIN from themselves', async () => {
    await fixture.run(async (args) => {
      const { put } = await asRole(args, 'ADMIN');
      const response = await put(args.user.id, [
        { role: 'RECRUITER', verticalId: args.user.verticalId },
      ]);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('SELF_ADMIN_REMOVAL');
      expect(await rolesOf(args, args.user.id)).toEqual([
        { role: 'ADMIN', verticalId: null },
        { role: 'RECRUITER', verticalId: args.user.verticalId },
      ]);
    });
  });

  it('answers 409 LAST_ADMIN when no other active Admin would remain, and the card says so', async () => {
    await fixture.run(async (args) => {
      const target = await member(args, [{ role: 'ADMIN', verticalId: null }]);
      const { request } = await asRole(args, 'ADMIN');
      const ctx = await request();
      await onlyAdminsAre(args, [args.user.id, target.userId]);
      expect((await getUserDetail(ctx, target.userId)).lastActiveAdmin).toBe(
        false,
      );
      // The caller lost ADMIN after this request was authorised (another Admin removed it meanwhile).
      await args.ctx.db
        .delete(schema.userRole)
        .where(
          and(
            eq(schema.userRole.userId, args.user.id),
            eq(schema.userRole.role, 'ADMIN'),
          ),
        );
      expect((await getUserDetail(ctx, target.userId)).lastActiveAdmin).toBe(
        true,
      );
      await expect(
        updateUserRoles(ctx, target.userId, { roles: [], expectedVersion: 1 }),
      ).rejects.toMatchObject({ status: 409, code: 'LAST_ADMIN' });
      expect(await rolesOf(args, target.userId)).toEqual([
        { role: 'ADMIN', verticalId: null },
      ]);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
    });
  });

  it('removes ADMIN from another Admin while one more stays active', async () => {
    await fixture.run(async (args) => {
      const target = await member(args, [{ role: 'ADMIN', verticalId: null }]);
      const { put } = await asRole(args, 'ADMIN');
      await onlyAdminsAre(args, [args.user.id, target.userId]);
      expect((await put(target.userId, [])).status).toBe(200);
      expect(await rolesOf(args, target.userId)).toEqual([]);
    });
  });

  it('does not count an unaccepted invite or a deactivated Admin as an active administrator [D45]', async () => {
    await fixture.run(async (args) => {
      const target = await member(args, [{ role: 'ADMIN', verticalId: null }]);
      const pending = await invitee(args);
      await args.ctx.db.insert(schema.userRole).values({
        userId: pending.userId,
        role: 'ADMIN',
        verticalId: null,
      });
      const inactive = await member(args, [
        { role: 'ADMIN', verticalId: null },
      ]);
      const { request } = await asRole(args, 'ADMIN');
      const ctx = await request();
      await onlyAdminsAre(args, [target.userId, pending.userId]);
      expect((await getUserDetail(ctx, target.userId)).lastActiveAdmin).toBe(
        true,
      );
      await expect(
        updateUserRoles(ctx, target.userId, { roles: [], expectedVersion: 1 }),
      ).rejects.toMatchObject({ status: 409, code: 'LAST_ADMIN' });
      expect(await rolesOf(args, inactive.userId)).toEqual([
        { role: 'ADMIN', verticalId: null },
      ]);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
      expect(await auditsOf(args, target.userId)).toHaveLength(0);
    });
  });
});

describe('Change roles: concurrent writers on separate connections [D45, ADR-006]', () => {
  const clock = { now: () => new Date('2026-11-16T08:00:00Z') };
  const now = clock.now();
  const ctxFor = (userId: string): RequestContext => ({
    identity: {
      authUserId: randomUUID(),
      sessionId: randomUUID(),
      aal: 'aal2',
    },
    auth: buildAuthContext({
      userId: userId as UserId,
      roles: [{ role: 'ADMIN', verticalId: null }],
      aal: 'aal2',
      timezone: 'Europe/Kyiv',
    }),
    db: concurrentDb,
    clock,
    requestId: randomUUID(),
    ip: null,
    userAgent: null,
    mutationId: null,
  });
  async function committedAdmin() {
    const id = randomUUID();
    await admin`insert into app.app_user (id,email,full_name,activated_at,auth_user_id)
      values (${id}, ${`${id}@fixture.test`}, 'Адмін гонки ролей', ${now}, ${randomUUID()})`;
    await admin`insert into app.user_role (user_id,role,vertical_id) values (${id}, 'ADMIN', null)`;
    return id;
  }
  const adminRoles = (ids: string[]) =>
    admin`select user_id from app.user_role where role = 'ADMIN' and user_id in ${admin(ids)}`;

  it('lets only one of two Admins remove the other when they are the last two', async () => {
    const others =
      await admin`select u.id from app.app_user u join app.user_role r on r.user_id = u.id
        where r.role = 'ADMIN' and u.is_active`;
    const otherIds = others.map((row) => row.id as string);
    // Committed Admins from other suites are parked so these two are the only active ones.
    if (otherIds.length)
      await admin`update app.app_user set is_active = false, deactivated_at = ${now} where id in ${admin(otherIds)}`;
    try {
      for (let round = 0; round < 3; round++) {
        const a = await committedAdmin();
        const b = await committedAdmin();
        const results = await Promise.allSettled([
          updateUserRoles(ctxFor(a), b, { roles: [], expectedVersion: 1 }),
          updateUserRoles(ctxFor(b), a, { roles: [], expectedVersion: 1 }),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const lost = results.find((r) => r.status === 'rejected');
        expect(lost?.status === 'rejected' && lost.reason).toMatchObject({
          status: 409,
          code: 'LAST_ADMIN',
        });
        expect(await adminRoles([a, b])).toHaveLength(1);
        await admin`update app.app_user set is_active = false, deactivated_at = ${now} where id in ${admin([a, b])}`;
      }
    } finally {
      if (otherIds.length)
        await admin`update app.app_user set is_active = true, deactivated_at = null where id in ${admin(otherIds)}`;
    }
  });

  it('lets exactly one of two edits made from the same card version win', async () => {
    const actor = await committedAdmin();
    const target = randomUUID();
    const vertical = randomUUID();
    await admin`insert into app.vertical (id, name) values (${vertical}, ${`Гонка ${vertical}`})`;
    await admin`insert into app.app_user (id,email,full_name,activated_at,auth_user_id)
      values (${target}, ${`${target}@fixture.test`}, 'Гонка ролей', ${now}, ${randomUUID()})`;
    const results = await Promise.allSettled([
      updateUserRoles(ctxFor(actor), target, {
        roles: [{ role: 'RECRUITER', verticalId: vertical }],
        expectedVersion: 1,
      }),
      updateUserRoles(ctxFor(actor), target, {
        roles: [{ role: 'TEAM_LEAD', verticalId: vertical }],
        expectedVersion: 1,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected');
    expect(lost?.status === 'rejected' && lost.reason).toMatchObject({
      status: 409,
      code: 'STALE_STATE',
    });
    const roles =
      await admin`select role from app.user_role where user_id = ${target}`;
    expect(roles).toHaveLength(1);
    const [user] =
      await admin`select version from app.app_user where id = ${target}`;
    expect(user?.version).toBe(2);
    await admin`update app.app_user set is_active = false, deactivated_at = ${now} where id = ${actor}`;
  });

  it('serialises role edits with invite acceptance without deadlock or restoring old roles [ROLE-05-2]', async () => {
    const actor = await committedAdmin();
    const vertical = randomUUID();
    await admin`insert into app.vertical (id, name) values (${vertical}, ${`Запрошення ${vertical}`})`;
    try {
      for (let round = 0; round < 4; round++) {
        const target = randomUUID();
        const email = `${target}@fixture.test`;
        const { token, hash } = generateInviteToken();
        await admin`insert into app.app_user (id,email,full_name) values (${target}, ${email}, 'Гонка запрошення')`;
        await admin`insert into app.user_role (user_id,role,vertical_id) values (${target}, 'RECRUITER', ${vertical})`;
        await admin`insert into app.user_invite (user_id,token_hash,roles,sent_at,expires_at,invited_by)
          values (${target}, ${hash}, ${admin.json([{ role: 'RECRUITER', verticalId: vertical }])}, ${now}, ${new Date(now.getTime() + 72 * HOUR)}, ${actor})`;
        const ctx = ctxFor(actor);
        const edit = () =>
          updateUserRoles(ctx, target, {
            roles: [{ role: 'TEAM_LEAD', verticalId: vertical }],
            expectedVersion: 1,
          });
        const accept = () =>
          completeInviteGoogle(
            { ...ctx, auth: null },
            token,
            { authUserId: randomUUID(), sessionId: randomUUID(), aal: 'aal1' },
            { email, verified: true },
          );
        const operations =
          round % 2 === 0 ? [edit(), accept()] : [accept(), edit()];
        const results = await Promise.allSettled(operations);
        const accepted = results[round % 2 === 0 ? 1 : 0]!;
        const edited = results[round % 2 === 0 ? 0 : 1]!;
        expect(accepted).toEqual({ status: 'fulfilled', value: true });
        if (edited.status === 'rejected')
          expect(edited.reason).toMatchObject({
            status: 409,
            code: 'STALE_STATE',
          });
        const [stored] =
          await admin`select version,activated_at from app.app_user where id = ${target}`;
        expect(stored?.activated_at).not.toBeNull();
        expect(stored?.version).toBe(edited.status === 'fulfilled' ? 3 : 2);
        const current =
          await admin`select role from app.user_role where user_id = ${target}`;
        expect(current.map((r) => r.role)).toEqual([
          edited.status === 'fulfilled' ? 'TEAM_LEAD' : 'RECRUITER',
        ]);
        const [invite] =
          await admin`select status from app.user_invite where user_id = ${target}`;
        expect(invite?.status).toBe('ACCEPTED');
      }
    } finally {
      await admin`update app.app_user set is_active = false, deactivated_at = ${now} where id = ${actor}`;
    }
  });
});
