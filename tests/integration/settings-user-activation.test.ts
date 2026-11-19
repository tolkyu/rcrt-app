import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deactivateUserSchema,
  reactivateUserSchema,
  userActivationUpdatedSchema,
  userParamsSchema,
} from '../../lib/schemas/user';
import { generateInviteToken } from '../../server/auth/invite-token';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import type { VerifiedIdentity } from '../../server/context/identity';
import {
  loadAuthContext,
  type RequestContext,
} from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { completeInviteGoogle } from '../../server/services/auth/invite';
import { getUserDetail, listUserEventPage } from '../../server/services/user';
import {
  deactivateUser,
  reactivateUser,
} from '../../server/services/user-activation';
import { updateUserRoles } from '../../server/services/user-roles';
import { createAuthFixture } from '../support/auth-fixture';
import { FakeAuthServer, TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

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
  await Promise.all([fixture.close(), jwks.stop(), client.end(), admin.end()]);
});

type Fixture = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];
type Role = { role: string; verticalId: string | null };
type Action = 'deactivate' | 'reactivate';
const ACTIONS = ['deactivate', 'reactivate'] as const;
const NON_ADMINS = [
  'HEAD_RECRUITER',
  'RECRUITER',
  'HEAD_HR',
  'HR',
  'TEAM_LEAD',
  'FINANCE',
] as const;

async function caller(
  args: Fixture,
  role: string = 'ADMIN',
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
    ...args.ctx,
    identity,
    auth: await loadAuthContext(args.ctx.db, identity, args.ctx.clock),
  };
}

function routes(
  args: Fixture,
  ctx: RequestContext,
  deps = args.provider.dependencies(),
) {
  const defineRoute = createRouteFactory({
    db: () => ctx.db,
    clock: ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => ctx.identity,
  });
  const handlers = {
    deactivate: defineRoute(
      {
        method: 'POST',
        path: '/users/{userId}/deactivate',
        operationId: 'deactivateUser',
        summary: 'Deactivate',
        tags: ['Users'],
        params: userParamsSchema,
        body: deactivateUserSchema,
        response: userActivationUpdatedSchema,
        errors: [400, 404, 409, 503],
      },
      (request, { params, body }) =>
        deactivateUser(deps, request, params.userId, body),
    ),
    reactivate: defineRoute(
      {
        method: 'POST',
        path: '/users/{userId}/reactivate',
        operationId: 'reactivateUser',
        summary: 'Reactivate',
        tags: ['Users'],
        params: userParamsSchema,
        body: reactivateUserSchema,
        response: userActivationUpdatedSchema,
        errors: [400, 404, 409, 503],
      },
      (request, { params, body }) =>
        reactivateUser(deps, request, params.userId, body),
    ),
  };
  return (action: Action, userId: string, body: unknown) =>
    handlers[action](
      new Request(`${TEST_APP_URL}/api/v1/users/${userId}/${action}`, {
        method: 'POST',
        headers: {
          origin: TEST_APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ userId }) },
    );
}

async function member(
  args: Fixture,
  options: { active?: boolean; activated?: boolean; roles?: Role[] } = {},
) {
  const userId = randomUUID();
  const authUserId = randomUUID();
  const email = `${userId}@fixture.test`;
  const active = options.active ?? true;
  const session = await args.provider.issueSession(authUserId);
  await args.ctx.db.insert(schema.appUser).values({
    id: userId,
    email,
    fullName: 'Ольга Мельник',
    authUserId,
    activatedAt: options.activated === false ? null : args.ctx.clock.now(),
    isActive: active,
    deactivatedAt: active ? null : args.ctx.clock.now(),
  });
  const roles = options.roles ?? [
    { role: 'RECRUITER', verticalId: args.user.verticalId },
  ];
  if (roles.length)
    await args.ctx.db
      .insert(schema.userRole)
      .values(roles.map((r) => ({ userId, ...r })));
  await args.ctx.db.insert(schema.userSession).values({
    userId,
    sessionId: session.sessionId,
    method: 'MAGIC_LINK',
    startedAt: args.ctx.clock.now(),
    lastSeenAt: args.ctx.clock.now(),
  });
  if (!active) args.provider.banned.add(authUserId);
  const identity: VerifiedIdentity = {
    authUserId,
    sessionId: session.sessionId,
    aal: 'aal1',
  };
  return { userId, authUserId, email, identity, roles };
}

async function invite(
  args: Fixture,
  target: Awaited<ReturnType<typeof member>>,
) {
  const { token, hash } = generateInviteToken();
  await args.ctx.db.insert(schema.userInvite).values({
    userId: target.userId,
    tokenHash: hash,
    roles: target.roles,
    sentAt: args.ctx.clock.now(),
    expiresAt: new Date(args.ctx.clock.now().getTime() + 72 * 3_600_000),
    invitedBy: args.user.id,
  });
  return token;
}

async function stored(args: Fixture, userId: string) {
  const [user] = await args.ctx.db
    .select()
    .from(schema.appUser)
    .where(eq(schema.appUser.id, userId));
  const [roles, events, audits, sessions, invites] = await Promise.all([
    args.ctx.db
      .select()
      .from(schema.userRole)
      .where(eq(schema.userRole.userId, userId)),
    args.ctx.db
      .select()
      .from(schema.entityEvent)
      .where(eq(schema.entityEvent.subjectId, userId)),
    args.ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, userId)),
    args.ctx.db
      .select()
      .from(schema.userSession)
      .where(eq(schema.userSession.userId, userId)),
    args.ctx.db
      .select()
      .from(schema.userInvite)
      .where(eq(schema.userInvite.userId, userId)),
  ]);
  return { user: user!, roles, events, audits, sessions, invites };
}
const bodyFor = (action: Action, expectedVersion = 1) =>
  action === 'deactivate'
    ? { expectedVersion }
    : { expectedVersion, roles: [] };

describe('User activation authorization and validation [STORY-ROLE-05-5, VIS-01..03]', () => {
  it.each(NON_ADMINS)(
    'denies both actions to %s without changing the user',
    async (role) => {
      await fixture.run(async (args) => {
        const target = await member(args);
        const ctx = await caller(args, role);
        const post = routes(args, ctx);
        const before = await stored(args, target.userId);
        for (const action of ACTIONS) {
          const response = await post(action, target.userId, bodyFor(action));
          expect(response.status).toBe(404);
        }
        expect(await stored(args, target.userId)).toEqual(before);
        expect(args.provider.banned.has(target.authUserId)).toBe(false);
      });
    },
  );

  it('requires verified 2FA for either action', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const ctx = await caller(args, 'ADMIN', 'aal1');
      const post = routes(args, ctx);
      for (const action of ACTIONS) {
        const response = await post(action, target.userId, bodyFor(action));
        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe('MFA_REQUIRED');
      }
      expect((await stored(args, target.userId)).user.version).toBe(1);
    });
  });

  it('answers 404 for unknown and malformed ids', async () => {
    await fixture.run(async (args) => {
      const post = routes(args, await caller(args));
      for (const action of ACTIONS)
        for (const id of [randomUUID(), 'invalid'])
          expect((await post(action, id, bodyFor(action))).status).toBe(404);
    });
  });

  it('validates versions, reason length, strict bodies and restored role references before writing', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const post = routes(args, await caller(args));
      for (const body of [
        {},
        { expectedVersion: 0 },
        { expectedVersion: 1, reason: 'x'.repeat(501) },
        { expectedVersion: 1, deleted: true },
      ])
        expect((await post('deactivate', target.userId, body)).status).toBe(
          400,
        );
      for (const body of [
        { expectedVersion: 1 },
        { expectedVersion: 1, roles: 'ADMIN' },
        { expectedVersion: 1, roles: [{ role: 'HR', verticalId: null }] },
        { expectedVersion: 1, roles: [], deleted: true },
      ])
        expect((await post('reactivate', target.userId, body)).status).toBe(
          400,
        );
      expect((await stored(args, target.userId)).user.version).toBe(1);
    });
  });
});

describe('Deactivate user [D23, D44, STORY-ROLE-05-5]', () => {
  it('closes app and provider sessions, revokes invitations, preserves roles and records the reason only in audit', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const token = await invite(args, target);
      const ctx = await caller(args);
      const post = routes(args, ctx);
      const reason = 'Контракт завершено';
      const response = await post('deactivate', target.userId, {
        expectedVersion: 1,
        reason: `  ${reason}  `,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        version: 2,
        status: 'DEACTIVATED',
      });
      const state = await stored(args, target.userId);
      expect(state.user).toMatchObject({
        isActive: false,
        deactivatedAt: args.ctx.clock.now(),
        deactivatedBy: args.user.id,
        version: 2,
      });
      expect(
        state.roles.map(({ role, verticalId }) => ({ role, verticalId })),
      ).toEqual(target.roles);
      expect(
        state.sessions.every(
          (s) => s.endedAt !== null && s.endReason === 'DEACTIVATED',
        ),
      ).toBe(true);
      expect(state.invites[0]).toMatchObject({
        status: 'REVOKED',
        revokedBy: args.user.id,
      });
      expect(args.provider.banned.has(target.authUserId)).toBe(true);
      expect(
        state.events.filter((e) => e.type === 'user.deactivated'),
      ).toHaveLength(1);
      expect(
        JSON.stringify(state.events.map((event) => event.payload)),
      ).not.toContain(reason);
      expect(
        state.audits.find((a) => a.action === 'user.deactivated')?.after,
      ).toEqual({ isActive: false, reason });
      expect(
        state.audits.find((a) => a.action === 'auth.session_revoked'),
      ).toBeDefined();
      expect(
        JSON.stringify(await listUserEventPage(ctx, target.userId, {})),
      ).not.toContain(reason);
      await expect(
        loadAuthContext(args.ctx.db, target.identity, args.ctx.clock),
      ).rejects.toMatchObject({ status: 401 });
      expect(
        await completeInviteGoogle(
          { ...ctx, auth: null },
          token,
          target.identity,
          { email: target.email, verified: true },
        ),
      ).toBe(false);
      expect((await getUserDetail(ctx, target.userId)).status).toBe(
        'DEACTIVATED',
      );
    });
  });

  it('refuses self-deactivation and a never-activated user without side effects', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const post = routes(args, ctx);
      const own = await post('deactivate', args.user.id, {
        expectedVersion: 1,
      });
      expect(own.status).toBe(409);
      expect((await own.json()).code).toBe('SELF_DEACTIVATION');
      const target = await member(args, { activated: false });
      const before = await stored(args, target.userId);
      const response = await post('deactivate', target.userId, {
        expectedVersion: 1,
      });
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('USER_NOT_ACTIVATED');
      expect(await stored(args, target.userId)).toEqual(before);
    });
  });

  it('protects the last accepted active Admin; inactive and pending Admins do not count [D45]', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const target = await member(args, {
        roles: [{ role: 'ADMIN', verticalId: null }],
      });
      const pending = await member(args, {
        activated: false,
        roles: [{ role: 'ADMIN', verticalId: null }],
      });
      await member(args, {
        active: false,
        roles: [{ role: 'ADMIN', verticalId: null }],
      });
      const holders = args.ctx.db
        .select({ id: schema.userRole.userId })
        .from(schema.userRole)
        .where(eq(schema.userRole.role, 'ADMIN'));
      await args.ctx.db
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: args.ctx.clock.now() })
        .where(
          and(
            inArray(schema.appUser.id, holders),
            notInArray(schema.appUser.id, [target.userId, pending.userId]),
          ),
        );
      await expect(
        deactivateUser(args.provider.dependencies(), ctx, target.userId, {
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 409, code: 'LAST_ADMIN' });
      const state = await stored(args, target.userId);
      expect(state.user).toMatchObject({ isActive: true, version: 1 });
      expect(state.events).toHaveLength(0);
      expect(state.audits).toHaveLength(0);
      expect(args.provider.banned.has(target.authUserId)).toBe(false);
    });
  });

  it('contacts the provider before changing either local state or app-session rows [ADR-011]', async () => {
    await fixture.run(async (args) => {
      const target = await member(args);
      const ctx = await caller(args);
      const real = args.provider.admin();
      const setBanned = vi.fn(async (authUserId: string, banned: boolean) => {
        const state = await stored(args, target.userId);
        expect(state.user.isActive).toBe(banned);
        if (banned)
          expect(state.sessions.every((s) => s.endedAt === null)).toBe(true);
        return real.setBanned(authUserId, banned);
      });
      const deps = {
        ...args.provider.dependencies(),
        admin: () => ({ ...real, setBanned }),
      };
      await deactivateUser(deps, ctx, target.userId, { expectedVersion: 1 });
      await reactivateUser(deps, ctx, target.userId, {
        expectedVersion: 2,
        roles: target.roles,
      });
      expect(setBanned.mock.calls.map(([, banned]) => banned)).toEqual([
        true,
        false,
      ]);
      // Reactivation found nothing open, so only deactivation recorded a revocation.
      expect(
        (await stored(args, target.userId)).audits.filter(
          (a) => a.action === 'auth.session_revoked',
        ),
      ).toHaveLength(1);
    });
  });

  it.each(['false', 'throw'] as const)(
    'persists safe local denial when provider ban returns %s; retry is idempotent [SEC-AUTH-R04]',
    async (failure) => {
      await fixture.run(async (args) => {
        const target = await member(args);
        await invite(args, target);
        const ctx = await caller(args);
        const real = args.provider.admin();
        const setBanned = vi.fn(real.setBanned);
        if (failure === 'throw')
          setBanned.mockRejectedValueOnce(new Error('Private upstream detail'));
        else setBanned.mockResolvedValueOnce(false);
        const deps = {
          ...args.provider.dependencies(),
          admin: () => ({ ...real, setBanned }),
        };
        const post = routes(args, ctx, deps);
        const failed = await post('deactivate', target.userId, {
          expectedVersion: 1,
          reason: 'Завершення роботи',
        });
        expect(failed.status).toBe(503);
        const problem = await failed.json();
        expect(problem.code).toBe('DEACTIVATION_INCOMPLETE');
        expect(JSON.stringify(problem)).not.toContain(
          'Private upstream detail',
        );
        const state = await stored(args, target.userId);
        expect(state.user).toMatchObject({ isActive: false, version: 2 });
        expect(state.sessions.every((s) => s.endedAt !== null)).toBe(true);
        expect(state.invites.every((i) => i.status === 'REVOKED')).toBe(true);
        expect(state.audits).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'user.deactivated',
              result: 'DENIED',
              details: { reason: 'DEACTIVATION_INCOMPLETE' },
            }),
          ]),
        );
        await expect(
          loadAuthContext(args.ctx.db, target.identity, args.ctx.clock),
        ).rejects.toMatchObject({ status: 401 });
        // While the provider ban is missing the user can still obtain a provider session; the app refuses it.
        const late = await args.provider.issueSession(target.authUserId);
        const lateIdentity: VerifiedIdentity = {
          authUserId: target.authUserId,
          sessionId: late.sessionId,
          aal: 'aal1',
        };
        await expect(
          loadAuthContext(args.ctx.db, lateIdentity, args.ctx.clock),
        ).rejects.toMatchObject({ code: 'USER_DEACTIVATED' });
        const stale = await post('deactivate', target.userId, {
          expectedVersion: 1,
        });
        expect(stale.status).toBe(409);
        expect((await stale.json()).code).toBe('STALE_STATE');
        const retry = await post('deactivate', target.userId, {
          expectedVersion: 2,
        });
        expect(retry.status).toBe(200);
        expect(await retry.json()).toEqual({
          version: 2,
          status: 'DEACTIVATED',
        });
        const after = await stored(args, target.userId);
        expect(
          after.events.filter((e) => e.type === 'user.deactivated'),
        ).toHaveLength(1);
        expect(after.user.version).toBe(2);
        expect(args.provider.banned.has(target.authUserId)).toBe(true);
        expect(setBanned).toHaveBeenCalledTimes(2);
        await expect(
          loadAuthContext(args.ctx.db, lateIdentity, args.ctx.clock),
        ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
        expect(
          after.audits.filter(
            (a) => a.action === 'user.deactivated' && a.result !== 'DENIED',
          ),
        ).toHaveLength(1);
      });
    },
  );
});

describe('Concurrent user activation writes on separate connections [ADR-006, ADR-011, D45]', () => {
  const clock = { now: () => new Date('2026-11-16T08:00:00Z') };
  const now = clock.now();
  let provider: FakeAuthServer;
  beforeAll(() => {
    provider = new FakeAuthServer(jwks, admin, clock.now);
  });
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
  async function committed(active = true, role: string | null = null) {
    const id = randomUUID();
    const authUserId = randomUUID();
    await admin`insert into app.app_user (id,email,full_name,auth_user_id,activated_at,is_active,deactivated_at)
      values (${id}, ${`${id}@fixture.test`}, 'Гонка активації', ${authUserId}, ${now}, ${active}, ${active ? null : now})`;
    if (role)
      await admin`insert into app.user_role (user_id,role,vertical_id) values (${id}, ${role}, null)`;
    return { id, authUserId };
  }

  it.each(['deactivate', 'reactivate'] as const)(
    'lets exactly one same-version %s commit',
    async (action) => {
      const actor = await committed(true, 'ADMIN');
      const target = await committed(action === 'deactivate');
      const oldSession = await provider.issueSession(target.authUserId);
      await admin`insert into app.user_session (user_id,session_id,method,started_at,last_seen_at)
      values (${target.id}, ${oldSession.sessionId}, 'MAGIC_LINK', ${now}, ${now})`;
      const ctx = ctxFor(actor.id);
      const operation = () =>
        action === 'deactivate'
          ? deactivateUser(provider.dependencies(), ctx, target.id, {
              expectedVersion: 1,
            })
          : reactivateUser(provider.dependencies(), ctx, target.id, {
              expectedVersion: 1,
              roles: [],
            });
      try {
        const results = await Promise.allSettled([operation(), operation()]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const failure = results.find((r) => r.status === 'rejected');
        expect(failure?.status === 'rejected' && failure.reason).toMatchObject({
          status: 409,
          code: 'STALE_STATE',
        });
        const [stored] =
          await admin`select is_active,version from app.app_user where id = ${target.id}`;
        expect(stored).toEqual({
          is_active: action === 'reactivate',
          version: 2,
        });
        const lifecycle =
          await admin`select id from app.entity_event where subject_id = ${target.id} and type = ${action === 'deactivate' ? 'user.deactivated' : 'user.reactivated'}`;
        expect(lifecycle).toHaveLength(1);
        expect(
          await admin`select id from auth.sessions where user_id = ${target.authUserId}`,
        ).toHaveLength(0);
        const [session] =
          await admin`select ended_at,end_reason from app.user_session where session_id = ${oldSession.sessionId}`;
        expect(session?.ended_at).not.toBeNull();
        expect(session?.end_reason).toBe('DEACTIVATED');
      } finally {
        await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id = ${actor.id}`;
      }
    },
  );

  it('serialises deactivation with a role edit of the same user from the same card version', async () => {
    for (let round = 0; round < 3; round++) {
      const actor = await committed(true, 'ADMIN');
      const target = await committed(true, 'FINANCE');
      try {
        const [deactivated, edited] = await Promise.allSettled([
          deactivateUser(provider.dependencies(), ctxFor(actor.id), target.id, {
            expectedVersion: 1,
          }),
          updateUserRoles(ctxFor(actor.id), target.id, {
            expectedVersion: 1,
            roles: [],
          }),
        ]);
        const deactivationWon = deactivated.status === 'fulfilled';
        expect(deactivationWon).toBe(edited.status === 'rejected');
        const loser = deactivationWon ? edited : deactivated;
        expect(loser.status === 'rejected' && loser.reason).toMatchObject({
          status: 409,
          code: deactivationWon ? 'USER_DEACTIVATED' : 'STALE_STATE',
        });
        const [user] =
          await admin`select is_active,version from app.app_user where id = ${target.id}`;
        const roles =
          await admin`select role from app.user_role where user_id = ${target.id}`;
        expect(user).toEqual({ is_active: !deactivationWon, version: 2 });
        expect(roles).toHaveLength(deactivationWon ? 1 : 0);
        expect(provider.banned.has(target.authUserId)).toBe(deactivationWon);
      } finally {
        await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id = ${actor.id}`;
      }
    }
  });

  it('serialises deactivation with invite acceptance through the invite-first lock order, without deadlock [SEC-EML-03]', async () => {
    for (let round = 0; round < 4; round++) {
      const actor = await committed(true, 'ADMIN');
      const userId = randomUUID();
      const authUserId = randomUUID();
      const email = `${userId}@fixture.test`;
      const { token, hash } = generateInviteToken();
      await admin`insert into app.app_user (id,email,full_name) values (${userId}, ${email}, 'Гонка прийняття')`;
      await admin`insert into app.user_role (user_id,role,vertical_id) values (${userId}, 'FINANCE', null)`;
      await admin`insert into app.user_invite (user_id,token_hash,roles,sent_at,expires_at,invited_by)
        values (${userId}, ${hash}, ${admin.json([{ role: 'FINANCE', verticalId: null }])}, ${now}, ${new Date(now.getTime() + 72 * 3_600_000)}, ${actor.id})`;
      // Even rounds use the pre-acceptance card version, odd rounds the version acceptance produces.
      const expectedVersion = round % 2 === 0 ? 1 : 2;
      try {
        const [deactivated, accepted] = await Promise.allSettled([
          deactivateUser(provider.dependencies(), ctxFor(actor.id), userId, {
            expectedVersion,
          }),
          completeInviteGoogle(
            { ...ctxFor(actor.id), auth: null },
            token,
            { authUserId, sessionId: randomUUID(), aal: 'aal1' },
            { email, verified: true },
          ),
        ]);
        expect(accepted).toEqual({ status: 'fulfilled', value: true });
        const [user] =
          await admin`select is_active,activated_at,version from app.app_user where id = ${userId}`;
        const invites =
          await admin`select status from app.user_invite where user_id = ${userId}`;
        expect(invites.map((i) => i.status)).toEqual(['ACCEPTED']);
        expect(user?.activated_at).not.toBeNull();
        if (deactivated.status === 'fulfilled') {
          expect(expectedVersion).toBe(2);
          expect(user).toMatchObject({ is_active: false, version: 3 });
          expect(provider.banned.has(authUserId)).toBe(true);
        } else {
          expect(deactivated.reason).toMatchObject({ status: 409 });
          expect(['USER_NOT_ACTIVATED', 'STALE_STATE']).toContain(
            (deactivated.reason as { code: string }).code,
          );
          expect(user).toMatchObject({ is_active: true, version: 2 });
          expect(provider.banned.has(authUserId)).toBe(false);
        }
      } finally {
        await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id in ${admin([actor.id, userId])}`;
      }
    }
  });

  it('keeps an accepted active Admin when deactivation races ADMIN-role removal [D45]', async () => {
    const previous =
      await admin`select distinct u.id from app.app_user u join app.user_role r on r.user_id = u.id where r.role = 'ADMIN' and u.is_active`;
    const previousIds = previous.map((u) => u.id as string);
    if (previousIds.length)
      await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id in ${admin(previousIds)}`;
    try {
      for (let round = 0; round < 3; round++) {
        const a = await committed(true, 'ADMIN');
        const b = await committed(true, 'ADMIN');
        try {
          const results = await Promise.allSettled([
            deactivateUser(provider.dependencies(), ctxFor(a.id), b.id, {
              expectedVersion: 1,
            }),
            updateUserRoles(ctxFor(b.id), a.id, {
              expectedVersion: 1,
              roles: [],
            }),
          ]);
          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
            1,
          );
          const failure = results.find((r) => r.status === 'rejected');
          expect(
            failure?.status === 'rejected' && failure.reason,
          ).toMatchObject({ status: 409, code: 'LAST_ADMIN' });
          const active =
            await admin`select u.id from app.app_user u join app.user_role r on r.user_id = u.id
            where r.role = 'ADMIN' and u.is_active and u.activated_at is not null and u.id in ${admin([a.id, b.id])}`;
          expect(active).toHaveLength(1);
        } finally {
          await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id in ${admin([a.id, b.id])}`;
        }
      }
    } finally {
      if (previousIds.length)
        await admin`update app.app_user set is_active = true,deactivated_at = null where id in ${admin(previousIds)}`;
    }
  });

  it('never leaves zero accepted active Admins when reactivation restoring ADMIN races removal of the only other ADMIN role [D45, SEC-ROL-02]', async () => {
    const previous =
      await admin`select distinct u.id from app.app_user u join app.user_role r on r.user_id = u.id where r.role = 'ADMIN' and u.is_active`;
    const previousIds = previous.map((u) => u.id as string);
    if (previousIds.length)
      await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id in ${admin(previousIds)}`;
    try {
      for (let round = 0; round < 3; round++) {
        const a = await committed(true, 'ADMIN');
        const restored = await committed(false, 'ADMIN');
        try {
          const [reactivated, removed] = await Promise.allSettled([
            reactivateUser(provider.dependencies(), ctxFor(a.id), restored.id, {
              expectedVersion: 1,
              roles: [{ role: 'ADMIN', verticalId: null }],
            }),
            updateUserRoles(ctxFor(restored.id), a.id, {
              expectedVersion: 1,
              roles: [],
            }),
          ]);
          expect(reactivated.status).toBe('fulfilled');
          if (removed.status === 'rejected')
            expect(removed.reason).toMatchObject({
              status: 409,
              code: 'LAST_ADMIN',
            });
          const active =
            await admin`select u.id from app.app_user u join app.user_role r on r.user_id = u.id
            where r.role = 'ADMIN' and u.is_active and u.activated_at is not null and u.id in ${admin([a.id, restored.id])}`;
          expect(active.length).toBeGreaterThanOrEqual(1);
          const [version] =
            await admin`select version from app.app_user where id = ${restored.id}`;
          expect(version?.version).toBe(2);
        } finally {
          await admin`update app.app_user set is_active = false,deactivated_at = ${now} where id in ${admin([a.id, restored.id])}`;
        }
      }
    } finally {
      if (previousIds.length)
        await admin`update app.app_user set is_active = true,deactivated_at = null where id in ${admin(previousIds)}`;
    }
  });
});

describe('Reactivate user [D44, STORY-ROLE-05-5]', () => {
  it.each(['subset', 'empty', 'no-previous'] as const)(
    'restores %s, unbans, preserves activation date and never revives old sessions or invites',
    async (variant) => {
      await fixture.run(async (args) => {
        const prior: Role[] =
          variant === 'no-previous'
            ? []
            : [
                { role: 'RECRUITER', verticalId: args.user.verticalId },
                { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
              ];
        const target = await member(args, { active: false, roles: prior });
        if (prior.length) await invite(args, target);
        const ctx = await caller(args);
        const selected = variant === 'subset' ? [prior[0]!] : [];
        const result = await reactivateUser(
          args.provider.dependencies(),
          ctx,
          target.userId,
          { expectedVersion: 1, roles: selected },
        );
        expect(result).toEqual({ version: 2, status: 'ACTIVE' });
        const state = await stored(args, target.userId);
        expect(state.user).toMatchObject({
          isActive: true,
          activatedAt: args.ctx.clock.now(),
          deactivatedAt: null,
          deactivatedBy: null,
          version: 2,
        });
        expect(
          state.roles.map(({ role, verticalId }) => ({ role, verticalId })),
        ).toEqual(selected);
        expect(args.provider.banned.has(target.authUserId)).toBe(false);
        expect(state.invites.every((i) => i.status === 'REVOKED')).toBe(true);
        expect(state.sessions.every((s) => s.endedAt !== null)).toBe(true);
        await expect(
          loadAuthContext(args.ctx.db, target.identity, args.ctx.clock),
        ).rejects.toMatchObject({ status: 401 });
        const fresh = await args.provider.issueSession(target.authUserId);
        await args.ctx.db.insert(schema.userSession).values({
          userId: target.userId,
          sessionId: fresh.sessionId,
          method: 'MAGIC_LINK',
          startedAt: args.ctx.clock.now(),
          lastSeenAt: args.ctx.clock.now(),
        });
        const signedIn = await loadAuthContext(
          args.ctx.db,
          { ...target.identity, sessionId: fresh.sessionId },
          args.ctx.clock,
        );
        expect(signedIn.userId).toBe(target.userId);
        // Zero restored roles still signs in, to «Профіль» only (D44).
        expect(signedIn.grants.size > 0).toBe(selected.length > 0);
        const event = state.events.find((e) => e.type === 'user.reactivated');
        expect(event?.payload).toEqual({ v: 1, restoredRoles: selected });
        expect(
          state.events.filter((e) => e.type === 'user.role_removed'),
        ).toHaveLength(prior.length - selected.length);
      });
    },
  );

  it('rejects arbitrary new roles and mixed-case duplicate assignments without unbanning or writing', async () => {
    await fixture.run(async (args) => {
      const target = await member(args, { active: false });
      const ctx = await caller(args);
      const post = routes(args, ctx);
      const before = await stored(args, target.userId);
      for (const roles of [
        [{ role: 'FINANCE', verticalId: null }],
        [
          { role: 'RECRUITER', verticalId: args.user.verticalId },
          { role: 'RECRUITER', verticalId: args.user.verticalId.toUpperCase() },
        ],
      ]) {
        const response = await post('reactivate', target.userId, {
          expectedVersion: 1,
          roles,
        });
        expect(response.status).toBe(400);
      }
      expect(await stored(args, target.userId)).toEqual(before);
      expect(args.provider.banned.has(target.authUserId)).toBe(true);
    });
  });

  it.each(['false', 'throw'] as const)(
    'keeps inactive roles and version after unban %s, records DENIED and can retry safely',
    async (failure) => {
      await fixture.run(async (args) => {
        const target = await member(args, { active: false });
        const ctx = await caller(args);
        const real = args.provider.admin();
        const setBanned = vi.fn(real.setBanned);
        if (failure === 'throw')
          setBanned.mockRejectedValueOnce(new Error('Private unban failure'));
        else setBanned.mockResolvedValueOnce(false);
        const deps = {
          ...args.provider.dependencies(),
          admin: () => ({ ...real, setBanned }),
        };
        const post = routes(args, ctx, deps);
        const failed = await post('reactivate', target.userId, {
          expectedVersion: 1,
          roles: [],
        });
        expect(failed.status).toBe(503);
        expect((await failed.json()).code).toBe('REACTIVATION_INCOMPLETE');
        const state = await stored(args, target.userId);
        expect(state.user).toMatchObject({ isActive: false, version: 1 });
        expect(
          state.roles.map(({ role, verticalId }) => ({ role, verticalId })),
        ).toEqual(target.roles);
        expect(state.events).toHaveLength(0);
        expect(state.audits).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'user.reactivated',
              result: 'DENIED',
              details: { reason: 'REACTIVATION_INCOMPLETE' },
            }),
          ]),
        );
        const retry = await post('reactivate', target.userId, {
          expectedVersion: 1,
          roles: [],
        });
        expect(retry.status).toBe(200);
        expect((await stored(args, target.userId)).user).toMatchObject({
          isActive: true,
          version: 2,
        });
        expect(args.provider.banned.has(target.authUserId)).toBe(false);
      });
    },
  );

  it('refuses already-active, never-activated and stale users without provider calls', async () => {
    await fixture.run(async (args) => {
      const active = await member(args);
      const never = await member(args, { active: false, activated: false });
      const inactive = await member(args, { active: false });
      const real = args.provider.admin();
      const setBanned = vi.fn(real.setBanned);
      const ctx = await caller(args);
      const post = routes(args, ctx, {
        ...args.provider.dependencies(),
        admin: () => ({ ...real, setBanned }),
      });
      for (const [target, version, code] of [
        [active, 1, 'USER_ALREADY_ACTIVE'],
        [never, 1, 'USER_NOT_ACTIVATED'],
        [inactive, 2, 'STALE_STATE'],
      ] as const) {
        const response = await post('reactivate', target.userId, {
          expectedVersion: version,
          roles: [],
        });
        expect(response.status).toBe(409);
        expect((await response.json()).code).toBe(code);
        expect((await stored(args, target.userId)).events).toHaveLength(0);
      }
      expect(setBanned).not.toHaveBeenCalled();
    });
  });
});
