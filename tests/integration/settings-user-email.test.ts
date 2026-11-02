import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  changeUserEmailSchema,
  userEmailChangedSchema,
  userInviteActionSchema,
  userInviteSentSchema,
  userParamsSchema,
} from '../../lib/schemas/user';
import {
  generateInviteToken,
  hashInviteToken,
} from '../../server/auth/invite-token';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import {
  loadAuthContext,
  type RequestContext,
  type SystemContext,
} from '../../server/context/request-context';
import type { VerifiedIdentity } from '../../server/context/identity';
import * as schema from '../../server/db/schema';
import { EVENT_PAYLOADS } from '../../server/events';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { EmailConfigurationError } from '../../server/integrations/email/transport';
import { logger } from '../../server/observability/logger';
import {
  completeInviteGoogle,
  createInvite,
} from '../../server/services/auth/invite';
import {
  changeInviteeEmail,
  resendInvite,
  revokeInvite,
} from '../../server/services/auth/invite-manage';
import {
  getUserDetail,
  listUserEventPage,
  listUserPage,
} from '../../server/services/user';
import { createAuthFixture } from '../support/auth-fixture';
import { FakeAuthServer, TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const HOUR = 3_600_000;
const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 3, prepare: false });
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

/** `PUT /users/{id}/email` and the resend/revoke routes through the real route factory, bound to the fixture transaction. */
function routes({ ctx, provider }: FixtureArgs, identity: VerifiedIdentity) {
  const defineRoute = createRouteFactory({
    db: () => ctx.db,
    clock: ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => identity,
  });
  const deps = provider.dependencies();
  const change = defineRoute(
    {
      method: 'PUT',
      path: '/users/{userId}/email',
      operationId: 'changeUserEmail',
      summary: 'Change email',
      tags: ['Users'],
      params: userParamsSchema,
      body: changeUserEmailSchema,
      response: userEmailChangedSchema,
      errors: [400, 404, 409],
    },
    (request, { params, body }) =>
      changeInviteeEmail(deps, request, params.userId, body),
  );
  const resend = defineRoute(
    {
      method: 'POST',
      path: '/users/{userId}/invite/resend',
      operationId: 'resendUserInvite',
      summary: 'Resend',
      tags: ['Users'],
      params: userParamsSchema,
      body: userInviteActionSchema,
      response: userInviteSentSchema,
      errors: [400, 404, 409],
    },
    (request, { params }) => resendInvite(deps, request, params.userId),
  );
  const call = (
    handler: typeof change,
    method: string,
    path: string,
    userId: string,
    body: unknown,
  ) =>
    handler(
      new Request(`${TEST_APP_URL}/api/v1/users/${userId}/${path}`, {
        method,
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
    /** The card version defaults to 1 (a fresh invitee); pass the next one after each successful change. */
    put: (userId: string, body: object, expectedVersion = 1) =>
      call(change, 'PUT', 'email', userId, { expectedVersion, ...body }),
    putRaw: (userId: string, body: unknown) =>
      call(change, 'PUT', 'email', userId, body),
    resend: (userId: string) =>
      call(resend, 'POST', 'invite/resend', userId, {}),
  };
}

async function withRole(
  args: FixtureArgs,
  role: 'ADMIN' | 'HEAD_RECRUITER' | 'FINANCE',
  aal: 'aal1' | 'aal2' = 'aal2',
) {
  await args.ctx.db.insert(schema.userRole).values({
    userId: args.user.id,
    role,
    verticalId: role === 'HEAD_RECRUITER' ? args.user.verticalId : null,
  });
  await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  return {
    ...routes(args, identity),
    request: async (): Promise<RequestContext> => ({
      ...args.ctx,
      auth: await loadAuthContext(args.ctx.db, identity, args.ctx.clock),
      identity,
    }),
  };
}

/** A never-activated user with one RECRUITER role and a known token for their latest invite. */
async function invitee(
  args: FixtureArgs,
  options: {
    sentHoursAgo?: number;
    status?: 'PENDING' | 'REVOKED';
    roles?: boolean;
  } = {},
) {
  const { ctx, user } = args;
  const userId = randomUUID();
  const email = `${randomUUID()}@fixture.test`;
  const { token, hash } = generateInviteToken();
  const sentAt = new Date(
    ctx.clock.now().getTime() - (options.sentHoursAgo ?? 1) * HOUR,
  );
  await ctx.db
    .insert(schema.appUser)
    .values({ id: userId, email, fullName: 'Марина Савчук' });
  if (options.roles !== false)
    await ctx.db
      .insert(schema.userRole)
      .values({ userId, role: 'RECRUITER', verticalId: user.verticalId });
  const [invite] = await ctx.db
    .insert(schema.userInvite)
    .values({
      userId,
      tokenHash: hash,
      roles: [{ role: 'RECRUITER', verticalId: user.verticalId }],
      sentAt,
      expiresAt: new Date(sentAt.getTime() + 72 * HOUR),
      invitedBy: user.id,
      ...(options.status === 'REVOKED'
        ? {
            status: 'REVOKED' as const,
            revokedAt: ctx.clock.now(),
            revokedBy: user.id,
          }
        : {}),
    })
    .returning({ id: schema.userInvite.id });
  return { userId, email, token, inviteId: invite!.id };
}

const accept = (
  db: SystemContext['db'],
  clock: SystemContext['clock'],
  token: string,
  email: string,
) =>
  completeInviteGoogle(
    {
      auth: null,
      db,
      clock,
      requestId: randomUUID(),
      ip: null,
      userAgent: null,
      mutationId: null,
    },
    token,
    { authUserId: randomUUID(), sessionId: randomUUID(), aal: 'aal1' },
    { email, verified: true },
  );
const acceptIn = (args: FixtureArgs, token: string, email: string) =>
  accept(args.ctx.db, args.ctx.clock, token, email);

const tokenOf = (text: string) =>
  /#t=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? null;
const newAddress = () => `${randomUUID()}@fixture.test`;

const stored = async (args: FixtureArgs, userId: string) => {
  const [user] = await args.ctx.db
    .select({
      email: schema.appUser.email,
      version: schema.appUser.version,
      activatedAt: schema.appUser.activatedAt,
    })
    .from(schema.appUser)
    .where(eq(schema.appUser.id, userId));
  const invites = await args.ctx.db
    .select()
    .from(schema.userInvite)
    .where(eq(schema.userInvite.userId, userId))
    .orderBy(schema.userInvite.createdAt);
  return { user: user!, invites };
};

const eventsOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select({
      type: schema.entityEvent.type,
      payload: schema.entityEvent.payload,
      actorId: schema.entityEvent.actorId,
      pii: schema.entityEventPii.data,
    })
    .from(schema.entityEvent)
    .leftJoin(
      schema.entityEventPii,
      eq(schema.entityEventPii.eventId, schema.entityEvent.id),
    )
    .where(eq(schema.entityEvent.subjectId, userId))
    .orderBy(schema.entityEvent.id);

const auditsOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      details: schema.auditLog.details,
    })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityType, 'user'),
        eq(schema.auditLog.entityId, userId),
      ),
    )
    .orderBy(schema.auditLog.id);

/** Nothing changed: same address and version, the original token still the live one, no letter, event or audit. */
async function expectUntouched(
  args: FixtureArgs,
  target: Awaited<ReturnType<typeof invitee>>,
) {
  const { user, invites } = await stored(args, target.userId);
  expect(user).toMatchObject({ email: target.email, version: 1 });
  expect(invites).toHaveLength(1);
  expect(invites[0]).toMatchObject({ version: 1 });
  expect(invites[0]?.tokenHash).toEqual(hashInviteToken(target.token));
  expect(args.provider.sentEmails).toHaveLength(0);
  expect(await eventsOf(args, target.userId)).toHaveLength(0);
  expect(await auditsOf(args, target.userId)).toHaveLength(0);
}

describe('Change email: Admin with aal2 only [STORY-ROLE-05-7, VIS-02]', () => {
  it.each(['HEAD_RECRUITER', 'FINANCE'] as const)(
    'answers 404 to %s and changes nothing',
    async (role) => {
      await fixture.run(async (args) => {
        const target = await invitee(args);
        const { put } = await withRole(args, role);
        const response = await put(target.userId, { email: newAddress() });
        expect(response.status).toBe(404);
        expect((await response.json()).code).toBe('NOT_FOUND');
        await expectUntouched(args, target);
      });
    },
  );

  it('answers 401 MFA_REQUIRED to an aal1 Admin and changes nothing', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await withRole(args, 'ADMIN', 'aal1');
      const response = await put(target.userId, { email: newAddress() });
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('MFA_REQUIRED');
      await expectUntouched(args, target);
    });
  });

  it('answers 404 for an unknown or malformed user id', async () => {
    await fixture.run(async (args) => {
      const { put } = await withRole(args, 'ADMIN');
      for (const id of [randomUUID(), 'not-a-uuid']) {
        const response = await put(id, { email: newAddress() });
        expect(response.status).toBe(404);
      }
      expect(args.provider.sentEmails).toHaveLength(0);
    });
  });

  it('rejects a malformed address and extra fields (roles, token) with 400 before any write', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put, putRaw } = await withRole(args, 'ADMIN');
      expect(
        (await putRaw(target.userId, { email: newAddress() })).status,
      ).toBe(400);
      for (const body of [
        {},
        { email: newAddress(), expectedVersion: 0 },
        { email: '' },
        { email: 'not an email' },
        { email: `${'a'.repeat(250)}@x.ua` },
        { email: newAddress(), roles: [{ role: 'ADMIN', verticalId: null }] },
        { email: newAddress(), token: 'replace-me' },
      ]) {
        const response = await put(target.userId, body);
        expect(response.status).toBe(400);
      }
      await expectUntouched(args, target);
    });
  });
});

describe('Change email: one step replaces the address and the invite [STORY-ROLE-05-7 AC1-AC5]', () => {
  it('revokes the pending invite, stores the new address and sends a new 72 h invite only to it', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put, request } = await withRole(args, 'ADMIN');
      const next = newAddress();
      const response = await put(target.userId, {
        email: `  ${next.toUpperCase()} `,
      });
      expect(response.status).toBe(200);
      const now = args.ctx.clock.now();
      const body = await response.json();
      expect(body).toEqual({
        inviteId: expect.any(String),
        expiresAt: new Date(now.getTime() + 72 * HOUR).toISOString(),
        delivered: true,
        version: 2,
      });
      const { user, invites } = await stored(args, target.userId);
      expect(user).toMatchObject({
        email: next,
        version: 2,
        activatedAt: null,
      });
      expect(invites).toHaveLength(2);
      const old = invites.find((i) => i.id === target.inviteId);
      const fresh = invites.find((i) => i.id === body.inviteId);
      expect(old).toMatchObject({
        status: 'REVOKED',
        revokedAt: now,
        revokedBy: args.user.id,
      });
      expect(fresh).toMatchObject({
        status: 'PENDING',
        sentAt: now,
        expiresAt: new Date(now.getTime() + 72 * HOUR),
        resendCount: 0,
        invitedBy: args.user.id,
        roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
      });
      expect(args.provider.sentEmails.map((m) => m.to)).toEqual([next]);
      const token = tokenOf(args.provider.sentEmails[0]!.text);
      expect(fresh?.tokenHash).toEqual(hashInviteToken(token!));

      const ctx = await request();
      const detail = await getUserDetail(ctx, target.userId);
      expect(detail).toMatchObject({ email: next, status: 'INVITED' });
      expect(detail.invitation).toMatchObject({
        sentAt: now.toISOString(),
        resendCount: 0,
      });
      const byNew = await listUserPage(ctx, { q: next });
      expect(byNew.items.map((item) => item.id)).toEqual([target.userId]);
      expect((await listUserPage(ctx, { q: target.email })).items).toEqual([]);

      expect(await acceptIn(args, target.token, target.email)).toBe(false);
      expect(await acceptIn(args, target.token, next)).toBe(false);
      expect(await acceptIn(args, token!, target.email)).toBe(false);
      expect(await acceptIn(args, token!, next)).toBe(true);
    });
  });

  it('records one event with ids only, the addresses in the PII side row and the audit before/after [D72, SEC P1-12]', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put, request } = await withRole(args, 'ADMIN');
      const next = newAddress();
      const { inviteId } = await (
        await put(target.userId, { email: next })
      ).json();
      const roles = [{ role: 'RECRUITER', verticalId: args.user.verticalId }];
      const events = await eventsOf(args, target.userId);
      expect(events).toEqual([
        {
          type: 'user.email_changed',
          payload: { v: 1, inviteId, revokedInviteId: target.inviteId, roles },
          actorId: args.user.id,
          pii: { email: { old: target.email, new: next } },
        },
      ]);
      expect(JSON.stringify(events[0]?.payload)).not.toContain('@');
      expect(await auditsOf(args, target.userId)).toEqual([
        {
          action: 'user.email_changed',
          actorId: args.user.id,
          before: { email: target.email },
          after: { email: next },
          details: { inviteId, revokedInviteId: target.inviteId },
        },
      ]);
      const timeline = await listUserEventPage(
        await request(),
        target.userId,
        {},
      );
      expect(timeline.items).toHaveLength(1);
      expect(timeline.items[0]).toMatchObject({
        type: 'user.email_changed',
        roles: [{ role: 'RECRUITER', vertical: { id: args.user.verticalId } }],
        fields: null,
      });
      expect(JSON.stringify(timeline)).not.toContain('@');
    });
  });

  it('never accepts an address in the event payload allowlist', () => {
    const parsed = EVENT_PAYLOADS['user.email_changed'].safeParse({
      inviteId: randomUUID(),
      revokedInviteId: null,
      roles: [{ role: 'RECRUITER', verticalId: null }],
      email: 'a@b.ua',
    });
    expect(parsed.success).toBe(false);
  });

  it('revives an expired invite under the new address', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { sentHoursAgo: 100 });
      const { put, request } = await withRole(args, 'ADMIN');
      expect((await getUserDetail(await request(), target.userId)).status).toBe(
        'INVITE_EXPIRED',
      );
      const next = newAddress();
      expect((await put(target.userId, { email: next })).status).toBe(200);
      const detail = await getUserDetail(await request(), target.userId);
      expect(detail).toMatchObject({ email: next, status: 'INVITED' });
      const { invites } = await stored(args, target.userId);
      expect(invites.find((i) => i.id === target.inviteId)?.status).toBe(
        'REVOKED',
      );
    });
  });

  it('re-invites a revoked user in the same step; older links stay dead and nothing is revoked twice [D70]', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { status: 'REVOKED' });
      const { put, request } = await withRole(args, 'ADMIN');
      const next = newAddress();
      const response = await put(target.userId, { email: next });
      expect(response.status).toBe(200);
      const { inviteId } = await response.json();
      const { invites } = await stored(args, target.userId);
      expect(invites.find((i) => i.id === target.inviteId)).toMatchObject({
        status: 'REVOKED',
        version: 1,
      });
      const [event] = await eventsOf(args, target.userId);
      expect(event?.payload).toMatchObject({ inviteId, revokedInviteId: null });
      const [audit] = await auditsOf(args, target.userId);
      expect(audit?.details).toEqual({ inviteId, revokedInviteId: null });
      expect((await getUserDetail(await request(), target.userId)).status).toBe(
        'INVITED',
      );
      expect(await acceptIn(args, target.token, next)).toBe(false);
    });
  });

  it('keeps every correction: A→B→C leaves only C working, two history entries, and C→A is allowed', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await withRole(args, 'ADMIN');
      const b = newAddress();
      const c = newAddress();
      expect((await put(target.userId, { email: b })).status).toBe(200);
      expect((await put(target.userId, { email: c }, 2)).status).toBe(200);
      const [toB, toC] = args.provider.sentEmails.map((m) => tokenOf(m.text)!);
      expect(args.provider.sentEmails.map((m) => m.to)).toEqual([b, c]);
      const { invites } = await stored(args, target.userId);
      expect(invites.map((i) => i.status)).toEqual([
        'REVOKED',
        'REVOKED',
        'PENDING',
      ]);
      expect((await eventsOf(args, target.userId)).map((e) => e.type)).toEqual([
        'user.email_changed',
        'user.email_changed',
      ]);
      expect(await acceptIn(args, toB!, b)).toBe(false);
      expect(
        (await put(target.userId, { email: target.email }, 3)).status,
      ).toBe(200);
      expect(await acceptIn(args, toC!, c)).toBe(false);
      const back = tokenOf(args.provider.sentEmails[2]!.text)!;
      expect(await acceptIn(args, back, target.email)).toBe(true);
    });
  });

  it('frees the old address for a new invite', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put, request } = await withRole(args, 'ADMIN');
      expect((await put(target.userId, { email: newAddress() })).status).toBe(
        200,
      );
      const created = await createInvite(
        args.provider.dependencies(),
        await request(),
        {
          email: target.email,
          fullName: 'Інша Людина',
          roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
        },
      );
      expect(created.userId).not.toBe(target.userId);
    });
  });
});

describe('Change email: refusals leave everything as it was [STORY-ROLE-05-7 negatives]', () => {
  it.each([
    ['activated', 'USER_ACTIVATED'],
    ['activated then deactivated', 'USER_ACTIVATED'],
    ['deactivated before activation', 'USER_DEACTIVATED'],
  ] as const)('%s user → 409 %s', async (state, code) => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const now = args.ctx.clock.now();
      await args.ctx.db
        .update(schema.appUser)
        .set({
          ...(state.startsWith('activated')
            ? { activatedAt: now, authUserId: randomUUID() }
            : {}),
          ...(state.includes('deactivated')
            ? { isActive: false, deactivatedAt: now }
            : {}),
        })
        .where(eq(schema.appUser.id, target.userId));
      const { put } = await withRole(args, 'ADMIN');
      const response = await put(target.userId, { email: newAddress() });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe(code);
      expect(body).not.toHaveProperty('errors');
      const { user, invites } = await stored(args, target.userId);
      expect(user.email).toBe(target.email);
      expect(invites[0]).toMatchObject({ status: 'PENDING', version: 1 });
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
    });
  });

  it('answers 409 STALE_STATE when the card version is not the current one', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await withRole(args, 'ADMIN');
      const response = await put(target.userId, { email: newAddress() }, 2);
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe('STALE_STATE');
      expect(body).not.toHaveProperty('errors');
      await expectUntouched(args, target);
    });
  });

  it('answers 400 EMAIL_UNCHANGED for the current address, also case- and space-only differences', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await withRole(args, 'ADMIN');
      for (const email of [target.email, ` ${target.email.toUpperCase()}  `]) {
        const response = await put(target.userId, { email });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          code: 'EMAIL_UNCHANGED',
          errors: [{ path: 'body.email', code: 'unchanged' }],
        });
      }
      await expectUntouched(args, target);
    });
  });

  it('answers the invite-dialog 409 codes, marked as the email field, for an address held by anyone else', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const pending = await invitee(args);
      const revoked = await invitee(args, { status: 'REVOKED' });
      const deactivated = await invitee(args);
      await args.ctx.db
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: args.ctx.clock.now() })
        .where(eq(schema.appUser.id, deactivated.userId));
      const { put } = await withRole(args, 'ADMIN');
      for (const [email, code] of [
        [args.user.email, 'USER_EXISTS'],
        [pending.email.toUpperCase(), 'INVITE_PENDING'],
        [revoked.email, 'INVITE_REVOKED'],
        [deactivated.email, 'USER_DEACTIVATED'],
      ] as const) {
        const response = await put(target.userId, { email });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code,
          errors: [{ path: 'body.email', code: 'taken' }],
        });
      }
      await expectUntouched(args, target);
    });
  });

  it('refuses with 409 INVITE_ROLES_INVALID when the user has no roles; the old link keeps working', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { roles: false });
      const { put } = await withRole(args, 'ADMIN');
      const response = await put(target.userId, { email: newAddress() });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe('INVITE_ROLES_INVALID');
      expect(body).not.toHaveProperty('errors');
      await expectUntouched(args, target);
      await args.ctx.db.insert(schema.userRole).values({
        userId: target.userId,
        role: 'RECRUITER',
        verticalId: args.user.verticalId,
      });
      expect(await acceptIn(args, target.token, target.email)).toBe(true);
    });
  });
});

describe('Change email: delivery failures keep the change [STORY-ROLE-05-7 AC3, SEC-INV-02]', () => {
  it.each(['declines', 'throws'] as const)(
    'reports delivered:false when the provider %s; the change stays and resend goes to the new address',
    async (failure) => {
      await fixture.run(async (args) => {
        const target = await invitee(args);
        const { put, resend, request } = await withRole(args, 'ADMIN');
        if (failure === 'throws')
          args.provider.sendError = new Error('Provider unavailable');
        else args.provider.sendResult = false;
        const next = newAddress();
        const response = await put(target.userId, { email: next });
        expect(response.status).toBe(200);
        expect((await response.json()).delivered).toBe(false);
        const detail = await getUserDetail(await request(), target.userId);
        expect(detail).toMatchObject({ email: next, status: 'INVITED' });
        args.provider.sendError = null;
        args.provider.sendResult = true;
        expect((await resend(target.userId)).status).toBe(200);
        const last = args.provider.sentEmails.at(-1)!;
        expect(last.to).toBe(next);
        expect(await acceptIn(args, tokenOf(last.text)!, next)).toBe(true);
      });
    },
  );

  it('logs a missing email configuration without either address or the link', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await withRole(args, 'ADMIN');
      args.provider.sendError = new EmailConfigurationError('RESEND_API_KEY');
      const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
      try {
        const next = newAddress();
        const response = await put(target.userId, { email: next });
        expect((await response.json()).delivered).toBe(false);
        expect(
          logged.mock.calls.filter(
            ([, message]) => message === 'invite email not sent',
          ),
        ).toEqual([
          [
            {
              operation: 'invite.send_email',
              err: { name: 'EmailConfigurationError', code: 'RESEND_API_KEY' },
            },
            'invite email not sent',
          ],
        ]);
        const serialized = JSON.stringify(logged.mock.calls);
        for (const secret of [next, target.email, '#t='])
          expect(serialized).not.toContain(secret);
      } finally {
        logged.mockRestore();
      }
    });
  });
});

describe('Change email: ordering against acceptance, resend and revoke [STORY-ROLE-05-7 edge cases]', () => {
  it('after an acceptance of the old link commits, the change answers 409 USER_ACTIVATED', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put } = await withRole(args, 'ADMIN');
      expect(await acceptIn(args, target.token, target.email)).toBe(true);
      const response = await put(target.userId, { email: newAddress() });
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('USER_ACTIVATED');
      expect((await stored(args, target.userId)).user.email).toBe(target.email);
    });
  });

  it('a resend after the change goes to the new address; a revoke after it kills the new invite', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { put, resend, request } = await withRole(args, 'ADMIN');
      const next = newAddress();
      await put(target.userId, { email: next });
      expect((await resend(target.userId)).status).toBe(200);
      expect(args.provider.sentEmails.map((m) => m.to)).toEqual([next, next]);
      const resent = tokenOf(args.provider.sentEmails[1]!.text)!;
      await revokeInvite(await request(), target.userId);
      expect(await acceptIn(args, resent, next)).toBe(false);
      const { invites } = await stored(args, target.userId);
      expect(invites.every((i) => i.status === 'REVOKED')).toBe(true);
    });
  });
});

/** Committed rows on separate connections: real row locks and unique-index waits, not one fixture transaction. */
describe('Change email: concurrent writers on separate connections [STORY-ROLE-05-7 edge cases, ADR-006]', () => {
  const clock = { now: () => new Date('2026-11-16T08:00:00Z') };
  const now = clock.now();
  const adminId = randomUUID();
  const ctx = (): RequestContext => ({
    identity: {
      authUserId: randomUUID(),
      sessionId: randomUUID(),
      aal: 'aal2',
    },
    auth: buildAuthContext({
      userId: adminId as UserId,
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
  let provider: FakeAuthServer;
  beforeAll(async () => {
    provider = new FakeAuthServer(jwks, admin, clock.now);
    await admin`insert into app.app_user (id,email,full_name,activated_at,auth_user_id)
      values (${adminId}, ${`${adminId}@fixture.test`}, 'Адмін гонки', ${now}, ${randomUUID()})`;
  });

  /** A committed invitee with a global role (no vertical needed) and a known pending token. */
  async function committedInvitee() {
    const userId = randomUUID();
    const email = `${userId}@fixture.test`;
    const { token, hash } = generateInviteToken();
    await admin`insert into app.app_user (id,email,full_name) values (${userId}, ${email}, 'Гонка зміни email')`;
    await admin`insert into app.user_role (user_id,role,vertical_id) values (${userId}, 'FINANCE', null)`;
    await admin`insert into app.user_invite (user_id,token_hash,roles,sent_at,expires_at,invited_by)
      values (${userId}, ${hash}, '[{"role":"FINANCE","verticalId":null}]', ${now}, ${new Date(now.getTime() + 72 * HOUR)}, ${adminId})`;
    return { userId, email, token };
  }
  const invitesOf = (userId: string) =>
    admin`select status from app.user_invite where user_id=${userId} order by created_at, id`;

  it('lets exactly one of a change and an old-link acceptance commit, without deadlock', async () => {
    const deps = provider.dependencies();
    for (let round = 0; round < 4; round++) {
      const { userId, email, token } = await committedInvitee();
      const next = `${randomUUID()}@fixture.test`;
      const [changed, accepted] = await Promise.allSettled([
        changeInviteeEmail(deps, ctx(), userId, {
          email: next,
          expectedVersion: 1,
        }),
        accept(concurrentDb, clock, token, email),
      ]);
      const changeWon = changed.status === 'fulfilled';
      const acceptWon = accepted.status === 'fulfilled' && accepted.value;
      expect(accepted.status).toBe('fulfilled');
      expect([changeWon, acceptWon].filter(Boolean)).toHaveLength(1);
      if (!changeWon)
        expect(changed.status === 'rejected' && changed.reason).toMatchObject({
          code: 'USER_ACTIVATED',
        });
      const [user] =
        await admin`select email, activated_at from app.app_user where id=${userId}`;
      const invites = await invitesOf(userId);
      if (changeWon) {
        expect(user).toMatchObject({ email: next, activated_at: null });
        expect(invites.map((i) => i.status).sort()).toEqual([
          'PENDING',
          'REVOKED',
        ]);
      } else {
        expect(user?.email).toBe(email);
        expect(invites.map((i) => i.status)).toEqual(['ACCEPTED']);
      }
    }
  });

  it('lets exactly one of two changes made from the same card version win: one address, one invite, one letter', async () => {
    const { userId } = await committedInvitee();
    const sent = provider.sentEmails.length;
    const first = `${randomUUID()}@fixture.test`;
    const second = `${randomUUID()}@fixture.test`;
    const deps = provider.dependencies();
    const results = await Promise.allSettled([
      changeInviteeEmail(deps, ctx(), userId, {
        email: first,
        expectedVersion: 1,
      }),
      changeInviteeEmail(deps, ctx(), userId, {
        email: second,
        expectedVersion: 1,
      }),
    ]);
    const won = results.findIndex((r) => r.status === 'fulfilled');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results[1 - won]!;
    expect(lost.status === 'rejected' && lost.reason).toMatchObject({
      status: 409,
      code: 'STALE_STATE',
    });
    const winner = won === 0 ? first : second;
    const [user] =
      await admin`select email, version from app.app_user where id=${userId}`;
    expect(user).toMatchObject({ email: winner, version: 2 });
    expect((await invitesOf(userId)).map((i) => i.status).sort()).toEqual([
      'PENDING',
      'REVOKED',
    ]);
    expect(provider.sentEmails.slice(sent).map((m) => m.to)).toEqual([winner]);
  });

  it('answers 409 INVITE_PENDING on the email field when a parallel invite takes the address first (unique index race)', async () => {
    const { userId, email } = await committedInvitee();
    const taken = `${randomUUID()}@fixture.test`;
    const deps = provider.dependencies();
    let change: Promise<unknown> | undefined;
    // The invite holds its uncommitted insert of `taken`, so the change passes its lookup and waits on the unique index.
    const created = await concurrentDb.transaction(async (tx) => {
      const [holder] = await tx.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`,
      );
      const invited = await createInvite(
        deps,
        { ...ctx(), db: tx },
        {
          email: taken,
          fullName: 'Паралельне запрошення',
          roles: [{ role: 'FINANCE', verticalId: null }],
        },
      );
      change = changeInviteeEmail(deps, ctx(), userId, {
        email: taken,
        expectedVersion: 1,
      });
      change.catch(() => undefined);
      await expect
        .poll(
          async () =>
            (
              await admin`select count(*)::int as n from pg_stat_activity where ${holder?.pid ?? 0}::int = any(pg_blocking_pids(pid))`
            )[0]?.n,
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0);
      return invited;
    });
    expect(created.userId).toBeTruthy();
    await expect(change).rejects.toMatchObject({
      status: 409,
      code: 'INVITE_PENDING',
      errors: [{ path: 'body.email', code: 'taken' }],
    });
    const [user] =
      await admin`select email, version from app.app_user where id=${userId}`;
    expect(user).toMatchObject({ email, version: 1 });
    expect((await invitesOf(userId)).map((i) => i.status)).toEqual(['PENDING']);
  });
});
