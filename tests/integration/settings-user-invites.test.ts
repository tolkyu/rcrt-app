import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  userInviteActionSchema,
  userInviteRevokedSchema,
  userInviteSentSchema,
  userParamsSchema,
} from '../../lib/schemas/user';
import {
  generateInviteToken,
  hashInviteToken,
} from '../../server/auth/invite-token';
import type { VerifiedIdentity } from '../../server/context/identity';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { EmailConfigurationError } from '../../server/integrations/email/transport';
import { logger } from '../../server/observability/logger';
import {
  consumeInvite,
  rotatePendingInvite,
} from '../../server/repositories/auth';
import {
  completeInviteGoogle,
  createInvite,
} from '../../server/services/auth/invite';
import {
  reinviteUser,
  resendInvite,
  revokeInvite,
} from '../../server/services/auth/invite-manage';
import { getUserDetail, listUserEventPage } from '../../server/services/user';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
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
type Action = 'resend' | 'revoke' | 'reinvite';
const ACTIONS: readonly Action[] = ['resend', 'revoke', 'reinvite'];

/** The three invite routes through the real route factory, bound to the fixture transaction. */
function inviteRoutes(
  { ctx, provider }: FixtureArgs,
  identity: VerifiedIdentity,
) {
  const defineRoute = createRouteFactory({
    db: () => ctx.db,
    clock: ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => identity,
  });
  const common = {
    method: 'POST',
    tags: ['Users'],
    params: userParamsSchema,
    body: userInviteActionSchema,
    errors: [400, 404, 409],
  } as const;
  const deps = provider.dependencies();
  const routes = {
    resend: defineRoute(
      {
        ...common,
        path: '/users/{userId}/invite/resend',
        operationId: 'resendUserInvite',
        summary: 'Resend',
        response: userInviteSentSchema,
      },
      (request, { params }) => resendInvite(deps, request, params.userId),
    ),
    revoke: defineRoute(
      {
        ...common,
        path: '/users/{userId}/invite/revoke',
        operationId: 'revokeUserInvite',
        summary: 'Revoke',
        response: userInviteRevokedSchema,
      },
      (request, { params }) => revokeInvite(request, params.userId),
    ),
    reinvite: defineRoute(
      {
        ...common,
        path: '/users/{userId}/invite',
        operationId: 'reinviteUser',
        summary: 'Re-invite',
        response: userInviteSentSchema,
        successStatus: 201,
      },
      (request, { params }) => reinviteUser(deps, request, params.userId),
    ),
  };
  return (action: Action, userId: string, body: unknown = {}) =>
    routes[action](
      new Request(
        `${TEST_APP_URL}/api/v1/users/${userId}/invite${action === 'reinvite' ? '' : `/${action}`}`,
        {
          method: 'POST',
          headers: {
            origin: TEST_APP_URL,
            'content-type': 'application/json',
            'x-csrf-protection': '1',
          },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ userId }) },
    );
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
    post: inviteRoutes(args, identity),
    request: async () => ({
      ...args.ctx,
      auth: await loadAuthContext(args.ctx.db, identity, args.ctx.clock),
      identity,
    }),
  };
}

/** An invited, never-activated user with one RECRUITER role and a known token. */
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
    .values({ id: userId, email, fullName: 'Марія Запрошена' });
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

/** Acceptance through the real consume path (Google variant needs no rate-limit bucket). */
const accept = (args: FixtureArgs, token: string, email: string) =>
  completeInviteGoogle(
    args.ctx,
    token,
    { authUserId: randomUUID(), sessionId: randomUUID(), aal: 'aal1' },
    { email, verified: true },
  );

const tokenOf = (text: string) =>
  /#t=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? null;

const invitesOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select()
    .from(schema.userInvite)
    .where(eq(schema.userInvite.userId, userId))
    .orderBy(schema.userInvite.createdAt);

const eventsOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select({
      type: schema.entityEvent.type,
      payload: schema.entityEvent.payload,
      actorId: schema.entityEvent.actorId,
      subjectType: schema.entityEvent.subjectType,
    })
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.subjectId, userId));

const auditsOf = (args: FixtureArgs, userId: string) =>
  args.ctx.db
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      after: schema.auditLog.after,
      details: schema.auditLog.details,
    })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityType, 'user'),
        eq(schema.auditLog.entityId, userId),
      ),
    );

describe('Invite actions: Admin with aal2 only [STORY-ROLE-05-3, VIS-02]', () => {
  it.each(['HEAD_RECRUITER', 'FINANCE'] as const)(
    'answers 404 to %s on every action and changes nothing',
    async (role) => {
      await fixture.run(async (args) => {
        const target = await invitee(args);
        const { post } = await withRole(args, role);
        for (const action of ACTIONS) {
          const response = await post(action, target.userId);
          expect(response.status).toBe(404);
          expect((await response.json()).code).toBe('NOT_FOUND');
        }
        const [invite] = await invitesOf(args, target.userId);
        expect(invite).toMatchObject({ status: 'PENDING', version: 1 });
        expect(invite?.tokenHash).toEqual(hashInviteToken(target.token));
        expect(args.provider.sentEmails).toHaveLength(0);
      });
    },
  );

  it('answers 401 MFA_REQUIRED to an aal1 Admin on every action', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { post } = await withRole(args, 'ADMIN', 'aal1');
      for (const action of ACTIONS) {
        const response = await post(action, target.userId);
        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe('MFA_REQUIRED');
      }
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
    });
  });

  it('answers 404 for an unknown or malformed user id', async () => {
    await fixture.run(async (args) => {
      const { post } = await withRole(args, 'ADMIN');
      for (const action of ACTIONS)
        for (const id of [randomUUID(), 'not-a-uuid']) {
          const response = await post(action, id);
          expect(response.status).toBe(404);
        }
    });
  });

  it('rejects role or token injection in the empty action body before any mutation', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { post } = await withRole(args, 'ADMIN');
      for (const action of ACTIONS) {
        const response = await post(action, target.userId, {
          roles: [{ role: 'ADMIN', verticalId: null }],
          token: 'replace-me',
        });
        expect(response.status).toBe(400);
      }
      const [invite] = await invitesOf(args, target.userId);
      expect(invite?.tokenHash).toEqual(hashInviteToken(target.token));
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
    });
  });
});

describe('Invite action safety after target state changes [ROLE-05, ROLE-06]', () => {
  it.each(['activated', 'deactivated'] as const)(
    'resend and revoke reject a pending invite of an %s user without changing it',
    async (state) => {
      await fixture.run(async (args) => {
        const target = await invitee(args);
        await args.ctx.db
          .update(schema.appUser)
          .set(
            state === 'activated'
              ? { activatedAt: args.ctx.clock.now(), authUserId: randomUUID() }
              : { isActive: false, deactivatedAt: args.ctx.clock.now() },
          )
          .where(eq(schema.appUser.id, target.userId));
        const { post } = await withRole(args, 'ADMIN');
        for (const action of ['resend', 'revoke'] as const) {
          const response = await post(action, target.userId);
          expect(response.status).toBe(409);
          expect((await response.json()).code).toBe('INVITE_NOT_PENDING');
        }
        const [invite] = await invitesOf(args, target.userId);
        expect(invite).toMatchObject({
          status: 'PENDING',
          version: 1,
          resendCount: 0,
        });
        expect(invite?.tokenHash).toEqual(hashInviteToken(target.token));
        expect(args.provider.sentEmails).toHaveLength(0);
        expect(await eventsOf(args, target.userId)).toHaveLength(0);
        expect(await auditsOf(args, target.userId)).toHaveLength(0);
      });
    },
  );

  it.each([
    ['resend', 'declines'],
    ['resend', 'throws'],
    ['reinvite', 'declines'],
    ['reinvite', 'throws'],
  ] as const)(
    '%s reports an undelivered email when the provider %s, keeps the new committed link single-use',
    async (action, failure) => {
      await fixture.run(async (args) => {
        const target = await invitee(
          args,
          action === 'reinvite' ? { status: 'REVOKED' } : {},
        );
        const { post } = await withRole(args, 'ADMIN');
        if (failure === 'throws')
          args.provider.sendError = new Error('Provider unavailable');
        else args.provider.sendResult = false;
        const response = await post(action, target.userId);
        expect(response.status).toBe(action === 'reinvite' ? 201 : 200);
        expect((await response.json()).delivered).toBe(false);
        expect(args.provider.sentEmails).toHaveLength(1);
        const token = tokenOf(args.provider.sentEmails[0]!.text);
        expect(token).not.toBeNull();
        expect(await accept(args, target.token, target.email)).toBe(false);
        expect(await accept(args, token!, target.email)).toBe(true);
        expect(await accept(args, token!, target.email)).toBe(false);
      });
    },
  );

  it('logs a missing email configuration without PII and reports invite, resend and re-invite as undelivered [SEC-INV-02]', async () => {
    await fixture.run(async (args) => {
      const pending = await invitee(args);
      const revoked = await invitee(args, { status: 'REVOKED' });
      const { post, request } = await withRole(args, 'ADMIN');
      args.provider.sendError = new EmailConfigurationError('RESEND_API_KEY');
      const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
      try {
        const email = `${randomUUID()}@fixture.test`;
        const created = await createInvite(
          args.provider.dependencies(),
          await request(),
          {
            email,
            fullName: 'Олена Нова',
            roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
          },
        );
        expect(created.delivered).toBe(false);
        const resent = await post('resend', pending.userId);
        expect(resent.status).toBe(200);
        expect((await resent.json()).delivered).toBe(false);
        const reinvited = await post('reinvite', revoked.userId);
        expect(reinvited.status).toBe(201);
        expect((await reinvited.json()).delivered).toBe(false);
        const sendFailures = logged.mock.calls.filter(
          ([, message]) => message === 'invite email not sent',
        );
        expect(sendFailures).toEqual(
          Array.from({ length: 3 }, () => [
            {
              operation: 'invite.send_email',
              err: { name: 'EmailConfigurationError', code: 'RESEND_API_KEY' },
            },
            'invite email not sent',
          ]),
        );
        const serialized = JSON.stringify(logged.mock.calls);
        for (const secret of [email, pending.email, revoked.email, '#t='])
          expect(serialized).not.toContain(secret);
      } finally {
        logged.mockRestore();
      }
    });
  });
});

describe('Resend: new 72 h link, the previous one stops working [STORY-ROLE-05-3 AC1]', () => {
  it('rotates the token of a fresh invite, records event + audit and the old link is rejected', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { post } = await withRole(args, 'ADMIN');
      const response = await post('resend', target.userId);
      expect(response.status).toBe(200);
      const now = args.ctx.clock.now();
      expect(await response.json()).toEqual({
        inviteId: target.inviteId,
        expiresAt: new Date(now.getTime() + 72 * HOUR).toISOString(),
        delivered: true,
      });
      expect(args.provider.sentEmails).toHaveLength(1);
      const email = args.provider.sentEmails[0]!;
      expect(email.to).toBe(target.email);
      const token = tokenOf(email.text);
      expect(token).not.toBeNull();
      expect(token).not.toBe(target.token);
      const [invite] = await invitesOf(args, target.userId);
      expect(invite).toMatchObject({
        status: 'PENDING',
        sentAt: now,
        expiresAt: new Date(now.getTime() + 72 * HOUR),
        resendCount: 1,
        version: 2,
      });
      expect(invite?.tokenHash).toEqual(hashInviteToken(token!));
      expect(await eventsOf(args, target.userId)).toEqual([
        {
          type: 'user.invite_resent',
          payload: { v: 1, inviteId: target.inviteId },
          actorId: args.user.id,
          subjectType: 'app_user',
        },
      ]);
      expect(await auditsOf(args, target.userId)).toEqual([
        {
          action: 'user.invite_resent',
          actorId: args.user.id,
          after: null,
          details: { inviteId: target.inviteId, resendCount: 1 },
        },
      ]);
      expect(JSON.stringify(await auditsOf(args, target.userId))).not.toContain(
        token,
      );
      expect(await accept(args, target.token, target.email)).toBe(false);
      expect(await accept(args, token!, target.email)).toBe(true);
    });
  });

  it('revives an expired invite and reports an undelivered email', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { sentHoursAgo: 100 });
      const { post, request } = await withRole(args, 'ADMIN');
      expect((await getUserDetail(await request(), target.userId)).status).toBe(
        'INVITE_EXPIRED',
      );
      args.provider.sendResult = false;
      const response = await post('resend', target.userId);
      expect(response.status).toBe(200);
      expect((await response.json()).delivered).toBe(false);
      const detail = await getUserDetail(await request(), target.userId);
      expect(detail.status).toBe('INVITED');
      expect(detail.invitation?.resendCount).toBe(1);
      const token = tokenOf(args.provider.sentEmails[0]!.text);
      expect(await accept(args, token!, target.email)).toBe(true);
    });
  });

  it('refuses with 409 INVITE_ROLES_INVALID when the user has no roles and keeps the old token', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { roles: false });
      const { post } = await withRole(args, 'ADMIN');
      const response = await post('resend', target.userId);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('INVITE_ROLES_INVALID');
      const [invite] = await invitesOf(args, target.userId);
      expect(invite).toMatchObject({ resendCount: 0, version: 1 });
      expect(invite?.tokenHash).toEqual(hashInviteToken(target.token));
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
    });
  });

  it('loses to an accept that committed first: 409 INVITE_NOT_PENDING, nothing sent', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { post } = await withRole(args, 'ADMIN');
      expect(await accept(args, target.token, target.email)).toBe(true);
      for (const action of ['resend', 'revoke'] as const) {
        const response = await post(action, target.userId);
        expect(response.status).toBe(409);
        expect((await response.json()).code).toBe('INVITE_NOT_PENDING');
      }
      const [invite] = await invitesOf(args, target.userId);
      expect(invite?.status).toBe('ACCEPTED');
      expect(args.provider.sentEmails).toHaveLength(0);
    });
  });
});

describe('Concurrent resend and accept on separate connections [STORY-ROLE-05-3 edge case]', () => {
  it('lets exactly one of a token rotation and a consume commit', async () => {
    const userId = randomUUID();
    const inviteId = randomUUID();
    const { hash } = generateInviteToken();
    const fresh = generateInviteToken();
    const now = new Date('2026-11-16T08:00:00Z');
    const expiresAt = new Date(now.getTime() + 72 * HOUR);
    try {
      await admin`insert into app.app_user (id,email,full_name) values (${userId}, ${`${userId}@fixture.test`}, 'Гонка запрошень')`;
      await admin`insert into app.user_invite (id,user_id,token_hash,roles,sent_at,expires_at,invited_by)
        values (${inviteId}, ${userId}, ${hash}, '[{"role":"ADMIN","verticalId":null}]', ${now}, ${expiresAt}, ${userId})`;
      for (let round = 0; round < 3; round++) {
        await admin`update app.user_invite set status='PENDING', accepted_at=null, token_hash=${hash} where id=${inviteId}`;
        const [consumed, rotated] = await Promise.all([
          consumeInvite(concurrentDb, hash, now),
          rotatePendingInvite(concurrentDb, {
            userId,
            tokenHash: fresh.hash,
            sentAt: now,
            expiresAt,
          }),
        ]);
        expect([consumed, rotated].filter(Boolean)).toHaveLength(1);
        const [stored] =
          await admin`select status, token_hash from app.user_invite where id=${inviteId}`;
        if (consumed) expect(stored?.status).toBe('ACCEPTED');
        else expect(stored?.token_hash).toEqual(fresh.hash);
      }
    } finally {
      await admin`delete from app.user_invite where id=${inviteId}`;
      await admin`delete from app.app_user where id=${userId}`;
    }
  });
});

describe('Revoke: the link stops working, status «Відкликано» [STORY-ROLE-05-3 AC2]', () => {
  it('revokes a pending invite, records event + audit, and later accept/resend/revoke fail', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args);
      const { post, request } = await withRole(args, 'ADMIN');
      const response = await post('revoke', target.userId);
      expect(response.status).toBe(200);
      const now = args.ctx.clock.now();
      expect(await response.json()).toEqual({
        inviteId: target.inviteId,
        revokedAt: now.toISOString(),
      });
      const [invite] = await invitesOf(args, target.userId);
      expect(invite).toMatchObject({
        status: 'REVOKED',
        revokedAt: now,
        revokedBy: args.user.id,
        version: 2,
      });
      expect(await eventsOf(args, target.userId)).toEqual([
        {
          type: 'user.invite_revoked',
          payload: { v: 1, inviteId: target.inviteId },
          actorId: args.user.id,
          subjectType: 'app_user',
        },
      ]);
      expect(await auditsOf(args, target.userId)).toEqual([
        {
          action: 'user.invite_revoked',
          actorId: args.user.id,
          after: null,
          details: { inviteId: target.inviteId },
        },
      ]);
      const detail = await getUserDetail(await request(), target.userId);
      expect(detail.status).toBe('REVOKED');
      expect(detail.invitation?.revokedBy?.id).toBe(args.user.id);
      expect(await accept(args, target.token, target.email)).toBe(false);
      for (const action of ['revoke', 'resend'] as const) {
        const again = await post(action, target.userId);
        expect(again.status).toBe(409);
        expect((await again.json()).code).toBe('INVITE_NOT_PENDING');
      }
      expect(args.provider.sentEmails).toHaveLength(0);
    });
  });

  it('also revokes an expired invite', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { sentHoursAgo: 100 });
      const { post } = await withRole(args, 'ADMIN');
      expect((await post('revoke', target.userId)).status).toBe(200);
      const [invite] = await invitesOf(args, target.userId);
      expect(invite?.status).toBe('REVOKED');
    });
  });
});

describe('Re-invite after revoke [D70]', () => {
  it('creates a new pending invite with the current roles; older links stay dead', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { status: 'REVOKED' });
      const { post, request } = await withRole(args, 'ADMIN');
      await args.ctx.db
        .insert(schema.userRole)
        .values({ userId: target.userId, role: 'FINANCE', verticalId: null });
      const response = await post('reinvite', target.userId);
      expect(response.status).toBe(201);
      const created = await response.json();
      const now = args.ctx.clock.now();
      expect(created).toEqual({
        inviteId: expect.any(String),
        expiresAt: new Date(now.getTime() + 72 * HOUR).toISOString(),
        delivered: true,
      });
      expect(created.inviteId).not.toBe(target.inviteId);
      const roles = [
        { role: 'FINANCE', verticalId: null },
        { role: 'RECRUITER', verticalId: args.user.verticalId },
      ];
      const invites = await invitesOf(args, target.userId);
      expect(invites).toHaveLength(2);
      const old = invites.find((i) => i.id === target.inviteId);
      const fresh = invites.find((i) => i.id === created.inviteId);
      expect(old).toMatchObject({ status: 'REVOKED', version: 1 });
      expect(old?.tokenHash).toEqual(hashInviteToken(target.token));
      expect(fresh).toMatchObject({
        status: 'PENDING',
        sentAt: now,
        resendCount: 0,
        invitedBy: args.user.id,
      });
      expect(fresh?.roles).toEqual(expect.arrayContaining(roles));
      const email = args.provider.sentEmails[0]!;
      expect(email.to).toBe(target.email);
      const token = tokenOf(email.text);
      expect(fresh?.tokenHash).toEqual(hashInviteToken(token!));
      const events = await eventsOf(args, target.userId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'user.reinvited',
        payload: {
          v: 1,
          inviteId: created.inviteId,
          roles: expect.arrayContaining(roles),
        },
        actorId: args.user.id,
      });
      const [audit] = await auditsOf(args, target.userId);
      expect(audit).toMatchObject({
        action: 'user.reinvited',
        after: { roles: expect.arrayContaining(roles) },
        details: { inviteId: created.inviteId },
      });
      const ctx = await request();
      expect((await getUserDetail(ctx, target.userId)).status).toBe('INVITED');
      const timeline = await listUserEventPage(ctx, target.userId, {});
      expect(timeline.items[0]?.type).toBe('user.reinvited');
      expect(timeline.items[0]?.roles).toHaveLength(2);
      expect(await accept(args, target.token, target.email)).toBe(false);
      expect(await accept(args, token!, target.email)).toBe(true);
    });
  });

  it('refuses with 409 INVITE_ROLES_INVALID when the user has no roles', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { status: 'REVOKED', roles: false });
      const { post } = await withRole(args, 'ADMIN');
      const response = await post('reinvite', target.userId);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('INVITE_ROLES_INVALID');
      expect(await invitesOf(args, target.userId)).toHaveLength(1);
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(await eventsOf(args, target.userId)).toHaveLength(0);
    });
  });

  it('refuses a user with a pending invite, an activated user and a deactivated one', async () => {
    await fixture.run(async (args) => {
      const pending = await invitee(args);
      const activated = await invitee(args, { status: 'REVOKED' });
      const deactivated = await invitee(args, { status: 'REVOKED' });
      await args.ctx.db
        .update(schema.appUser)
        .set({ activatedAt: args.ctx.clock.now(), authUserId: randomUUID() })
        .where(eq(schema.appUser.id, activated.userId));
      await args.ctx.db
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: args.ctx.clock.now() })
        .where(eq(schema.appUser.id, deactivated.userId));
      const { post } = await withRole(args, 'ADMIN');
      for (const [userId, code] of [
        [pending.userId, 'INVITE_ALREADY_PENDING'],
        [activated.userId, 'USER_EXISTS'],
        [deactivated.userId, 'USER_DEACTIVATED'],
      ] as const) {
        const response = await post('reinvite', userId);
        expect(response.status).toBe(409);
        expect((await response.json()).code).toBe(code);
      }
      expect(args.provider.sentEmails).toHaveLength(0);
    });
  });

  it('points a second invite for a revoked email to the user card: 409 INVITE_REVOKED', async () => {
    await fixture.run(async (args) => {
      const target = await invitee(args, { status: 'REVOKED' });
      const { request } = await withRole(args, 'ADMIN');
      await expect(
        createInvite(args.provider.dependencies(), await request(), {
          email: target.email,
          fullName: 'Марія Запрошена',
          roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
        }),
      ).rejects.toMatchObject({ status: 409, code: 'INVITE_REVOKED' });
      const pending = await invitee(args);
      await expect(
        createInvite(args.provider.dependencies(), await request(), {
          email: pending.email,
          fullName: 'Марія Запрошена',
          roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
        }),
      ).rejects.toMatchObject({ status: 409, code: 'INVITE_PENDING' });
      expect(args.provider.sentEmails).toHaveLength(0);
    });
  });
});
