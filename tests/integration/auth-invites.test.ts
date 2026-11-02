import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthCookieStore } from '../../server/auth/cookies';
import {
  generateInviteToken,
  hashInviteToken,
} from '../../server/auth/invite-token';
import type { VerifiedIdentity } from '../../server/context/identity';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { consumeInvite } from '../../server/repositories/auth';
import {
  completeInviteGoogle,
  acceptInvite,
  createInvite,
} from '../../server/services/auth/invite';
import {
  createInviteResponseSchema,
  createInviteSchema,
} from '../../lib/schemas/auth';
import { completeGoogleCallback } from '../../server/services/auth/google';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

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

async function pendingInvite(
  ctx: Parameters<
    Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
  >[0]['ctx'],
  inviter: { id: string; verticalId: string },
) {
  const userId = randomUUID();
  const email = `${randomUUID()}@fixture.test`;
  const { token, hash } = generateInviteToken();
  await ctx.db
    .insert(schema.appUser)
    .values({ id: userId, email, fullName: 'Запрошений користувач' });
  await ctx.db
    .insert(schema.userRole)
    .values({ userId, role: 'RECRUITER', verticalId: inviter.verticalId });
  const [invite] = await ctx.db
    .insert(schema.userInvite)
    .values({
      userId,
      tokenHash: hash,
      roles: [{ role: 'RECRUITER', verticalId: inviter.verticalId }],
      sentAt: ctx.clock.now(),
      expiresAt: new Date(ctx.clock.now().getTime() + 72 * 3600_000),
      invitedBy: inviter.id,
    })
    .returning({ id: schema.userInvite.id });
  return { id: invite!.id, userId, email, token };
}

describe('Invite consumption and Google identity binding [ROLE-05, D33, DG-07]', () => {
  it('allows exactly one concurrent consume of a pending invite', async () => {
    const userId = randomUUID();
    const inviteId = randomUUID();
    const { hash } = generateInviteToken();
    const now = new Date('2026-11-16T08:00:00Z');
    try {
      await admin`insert into app.app_user (id,email,full_name) values (${userId}, ${`${userId}@fixture.test`}, 'Конкурентне запрошення')`;
      await admin`insert into app.user_invite (id,user_id,token_hash,roles,sent_at,expires_at,invited_by)
        values (${inviteId}, ${userId}, ${hash}, '[{"role":"ADMIN","verticalId":null}]', ${now}, ${new Date(now.getTime() + 72 * 3600_000)}, ${userId})`;
      const result = await Promise.all([
        consumeInvite(concurrentDb, hash, now),
        consumeInvite(concurrentDb, hash, now),
      ]);
      expect(result.filter(Boolean)).toHaveLength(1);
      const [stored] =
        await admin`select status, version from app.user_invite where id=${inviteId}`;
      expect(stored).toEqual({ status: 'ACCEPTED', version: 2 });
    } finally {
      await admin`delete from app.user_invite where id=${inviteId}`;
      await admin`delete from app.app_user where id=${userId}`;
    }
  });

  it('activates the invite only for the matching verified Google email, allowing case normalization', async () => {
    await fixture.run(async ({ ctx, user }) => {
      const invite = await pendingInvite(ctx, user);
      const identity = {
        authUserId: randomUUID(),
        sessionId: randomUUID(),
        aal: 'aal1' as const,
      };
      expect(
        await completeInviteGoogle(ctx, invite.token, identity, {
          email: ` ${invite.email.toUpperCase()} `,
          verified: true,
        }),
      ).toBe(true);
      const [accepted] = await ctx.db
        .select()
        .from(schema.userInvite)
        .where(eq(schema.userInvite.id, invite.id));
      const [activated] = await ctx.db
        .select()
        .from(schema.appUser)
        .where(eq(schema.appUser.id, invite.userId));
      expect(accepted?.status).toBe('ACCEPTED');
      expect(activated).toMatchObject({
        authUserId: identity.authUserId,
        activatedAt: ctx.clock.now(),
      });
      expect(
        await completeInviteGoogle(ctx, invite.token, identity, {
          email: invite.email,
          verified: true,
        }),
      ).toBe(false);
    });
  });

  it.each([
    'unverified',
    'different-email',
    'plus-alias',
    'missing-email',
  ] as const)(
    'does not consume an invite with %s Google identity',
    async (reason) => {
      await fixture.run(async ({ ctx, user }) => {
        const invite = await pendingInvite(ctx, user);
        const google = {
          email:
            reason === 'missing-email'
              ? null
              : reason === 'different-email'
                ? 'different@fixture.test'
                : reason === 'plus-alias'
                  ? invite.email.replace('@', '+alias@')
                  : invite.email,
          verified: reason !== 'unverified',
        };
        expect(
          await completeInviteGoogle(
            ctx,
            invite.token,
            { authUserId: randomUUID(), sessionId: randomUUID(), aal: 'aal1' },
            google,
          ),
        ).toBe(false);
        const [pending] = await ctx.db
          .select()
          .from(schema.userInvite)
          .where(eq(schema.userInvite.id, invite.id));
        expect(pending?.status).toBe('PENDING');
      });
    },
  );

  it('checks exact expiry and current roles at acceptance, rather than relying on the invitation page', async () => {
    await fixture.run(async ({ ctx, user, at }) => {
      const invite = await pendingInvite(ctx, user);
      const identity = {
        authUserId: randomUUID(),
        sessionId: randomUUID(),
        aal: 'aal1' as const,
      };
      at(new Date(ctx.clock.now().getTime() + 72 * 3600_000));
      expect(
        await completeInviteGoogle(ctx, invite.token, identity, {
          email: invite.email,
          verified: true,
        }),
      ).toBe(false);
      at(new Date('2026-11-16T08:00:00Z'));
      await ctx.db
        .delete(schema.userRole)
        .where(eq(schema.userRole.userId, invite.userId));
      expect(
        await completeInviteGoogle(ctx, invite.token, identity, {
          email: invite.email,
          verified: true,
        }),
      ).toBe(false);
    });
  });

  it('rolls back single-use consumption when linking to a different existing auth identity fails', async () => {
    await fixture.run(async ({ ctx, user }) => {
      const invite = await pendingInvite(ctx, user);
      await ctx.db
        .update(schema.appUser)
        .set({ authUserId: randomUUID() })
        .where(eq(schema.appUser.id, invite.userId));
      expect(
        await completeInviteGoogle(
          ctx,
          invite.token,
          { authUserId: randomUUID(), sessionId: randomUUID(), aal: 'aal1' },
          { email: invite.email, verified: true },
        ),
      ).toBe(false);
      const [pending] = await ctx.db
        .select()
        .from(schema.userInvite)
        .where(eq(schema.userInvite.id, invite.id));
      expect(pending?.status).toBe('PENDING');
      expect(
        await ctx.db
          .select()
          .from(schema.entityEvent)
          .where(eq(schema.entityEvent.subjectId, invite.userId)),
      ).toHaveLength(0);
    });
  });

  it('rechecks roles after external provisioning before consuming an invite', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const invite = await pendingInvite(ctx, user);
      const deps = provider.dependencies();
      const authAdmin = provider.admin();
      const cookies = createAuthCookieStore(new Headers(), TEST_APP_URL);
      await expect(
        acceptInvite(
          {
            ...deps,
            admin: () => ({
              ...authAdmin,
              ensureUser: async () => {
                await ctx.db
                  .delete(schema.userRole)
                  .where(eq(schema.userRole.userId, invite.userId));
                const id = randomUUID();
                provider.users.set(invite.email, id);
                return id;
              },
            }),
          },
          ctx,
          { token: invite.token },
          cookies,
        ),
      ).rejects.toMatchObject({ code: 'INVITE_INVALID' });
      const [pending] = await ctx.db
        .select()
        .from(schema.userInvite)
        .where(eq(schema.userInvite.id, invite.id));
      expect(pending?.status).toBe('PENDING');
    });
  });

  it.each([true, false])(
    'verifies the real Google callback identity and enforces email verification=%s',
    async (verified) => {
      await fixture.run(async ({ ctx, provider, user }) => {
        provider.googleExchange = {
          accessToken: user.token,
          googleEmail: user.email.toUpperCase(),
          googleEmailVerified: verified,
        };
        const cookies = createAuthCookieStore(new Headers(), TEST_APP_URL);
        const result = await completeGoogleCallback(
          provider.dependencies(),
          ctx,
          { code: 'provider-test-code', error: null },
          cookies,
        );
        expect(result).toBe(verified ? '/' : '/login?reason=google_mismatch');
        const response = new Response();
        cookies.apply(response);
        if (verified)
          expect(
            response.headers
              .getSetCookie()
              .some(
                (cookie) =>
                  cookie.includes('HttpOnly') && !cookie.includes('Max-Age=0'),
              ),
          ).toBe(true);
        else
          expect(
            response.headers
              .getSetCookie()
              .every((cookie) => cookie.includes('Max-Age=0')),
          ).toBe(true);
      });
    },
  );

  it.each(['provider-error', 'missing-code', 'exchange-failed'] as const)(
    'keeps the existing session cookies on a failed callback (%s) and drops only the hand-off cookies [SEC-AUTH-R05]',
    async (failure) => {
      await fixture.run(async ({ ctx, provider }) => {
        provider.googleExchange = null;
        const cookies = createAuthCookieStore(
          new Headers({
            cookie:
              'theme=dark; sb-127-auth-token.0=existing; sb-127-auth-token.1=existing; sb-127-auth-token-code-verifier=pkce; hris-invite=handoff',
          }),
          TEST_APP_URL,
        );
        const result = await completeGoogleCallback(
          provider.dependencies(),
          ctx,
          {
            code: failure === 'exchange-failed' ? 'provider-test-code' : null,
            error: failure === 'provider-error' ? 'access_denied' : null,
          },
          cookies,
        );
        expect(result).toMatch(/^\/login\?reason=google_/);
        const response = new Response();
        cookies.apply(response);
        const set = response.headers.getSetCookie();
        const names = set.map((cookie) => cookie.split('=')[0]).sort();
        expect(names).toEqual([
          'hris-invite',
          'sb-127-auth-token-code-verifier',
        ]);
        expect(set.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
      });
    },
  );
});

type FixtureArgs = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];

/** POST /api/v1/invites through the real route factory, bound to the fixture transaction. */
function inviteRoute(
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
  const route = defineRoute(
    {
      method: 'POST',
      path: '/invites',
      operationId: 'createInvite',
      summary: 'Invite a person with roles (Admin with aal2 only)',
      tags: ['Users'],
      body: createInviteSchema,
      response: createInviteResponseSchema,
      successStatus: 201,
      errors: [400, 404, 409],
    },
    (request, { body }) => createInvite(provider.dependencies(), request, body),
  );
  return (body: unknown) =>
    route(
      new Request(`${TEST_APP_URL}/api/v1/invites`, {
        method: 'POST',
        headers: {
          origin: TEST_APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({}) },
    );
}

async function asAdmin(
  args: FixtureArgs,
  { aal, verified }: { aal: 'aal1' | 'aal2'; verified: boolean },
) {
  await args.ctx.db
    .insert(schema.userRole)
    .values({ userId: args.user.id, role: 'ADMIN', verticalId: null });
  if (verified) await args.markMfaVerified();
  return inviteRoute(args, { ...args.identity, aal });
}

const withBigInts = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );

describe('Creating invites: aal2 Admin only, token never stored or echoed [ROLE-05, T4-E01..E03, D40, CR-P1-04]', () => {
  it('lets an aal2 Admin invite; the token travels only in the email fragment', async () => {
    await fixture.run(async (args) => {
      const { ctx, provider, user } = args;
      const post = await asAdmin(args, { aal: 'aal2', verified: true });
      const email = `${randomUUID()}@fixture.test`;
      const response = await post({
        email: ` ${email.toUpperCase()} `,
        fullName: '  Олена   Коваль ',
        roles: [
          { role: 'RECRUITER', verticalId: user.verticalId },
          { role: 'FINANCE', verticalId: null },
        ],
      });
      expect(response.status).toBe(201);
      const text = await response.text();
      const created = JSON.parse(text);
      expect(created).toEqual({
        userId: expect.any(String),
        inviteId: expect.any(String),
        expiresAt: new Date(
          ctx.clock.now().getTime() + 72 * 3600_000,
        ).toISOString(),
        delivered: true,
      });
      expect(provider.sentEmails).toHaveLength(1);
      expect(provider.sentEmails[0]!.to).toBe(email);
      const token = /#t=([A-Za-z0-9_-]{43})/.exec(
        provider.sentEmails[0]!.text,
      )?.[1];
      expect(token).toBeDefined();
      expect(text).not.toContain(token);
      const [invited] = await ctx.db
        .select()
        .from(schema.appUser)
        .where(eq(schema.appUser.id, created.userId));
      expect(invited).toMatchObject({
        email,
        fullName: 'Олена Коваль',
        isActive: true,
        activatedAt: null,
        authUserId: null,
      });
      const [invite] = await ctx.db
        .select()
        .from(schema.userInvite)
        .where(eq(schema.userInvite.id, created.inviteId));
      expect(invite?.status).toBe('PENDING');
      expect(invite?.tokenHash).toEqual(hashInviteToken(token!));
      const audits = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.entityId, created.userId));
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: 'user.invited',
        entityType: 'user',
        actorId: user.id,
        details: { inviteId: created.inviteId },
      });
      const events = await ctx.db
        .select()
        .from(schema.entityEvent)
        .where(eq(schema.entityEvent.subjectId, created.userId));
      expect(events.map((event) => event.type)).toEqual(['user.invited']);
      const pii = await ctx.db
        .select()
        .from(schema.entityEventPii)
        .where(eq(schema.entityEventPii.eventId, events[0]!.id));
      expect(pii[0]?.data).toEqual({ email, fullName: 'Олена Коваль' });
      for (const stored of [audits, events, pii])
        expect(withBigInts(stored)).not.toContain(token);
    });
  });

  it('answers 404 to a Recruiter and 401 MFA_REQUIRED to an aal1 Admin', async () => {
    await fixture.run(async (args) => {
      const body = {
        email: `${randomUUID()}@fixture.test`,
        fullName: 'Відмовлене запрошення',
        roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
      };
      await args.markMfaVerified();
      const recruiter = await inviteRoute(args, {
        ...args.identity,
        aal: 'aal2',
      })(body);
      expect(recruiter.status).toBe(404);
      expect((await recruiter.json()).code).toBe('NOT_FOUND');
      const admin = await (
        await asAdmin(args, { aal: 'aal1', verified: true })
      )(body);
      expect(admin.status).toBe(401);
      expect((await admin.json()).code).toBe('MFA_REQUIRED');
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(
        await args.ctx.db
          .select()
          .from(schema.appUser)
          .where(eq(schema.appUser.email, body.email)),
      ).toHaveLength(0);
    });
  });

  it.each(['USER_EXISTS', 'INVITE_PENDING', 'USER_DEACTIVATED'] as const)(
    'refuses an existing person with 409 %s',
    async (code) => {
      await fixture.run(async (args) => {
        const { ctx, user } = args;
        const post = await asAdmin(args, { aal: 'aal2', verified: true });
        let email = user.email;
        let holderId: string | null = null;
        if (code === 'INVITE_PENDING')
          email = (await pendingInvite(ctx, user)).email;
        if (code === 'USER_DEACTIVATED') {
          email = `${randomUUID()}@fixture.test`;
          holderId = randomUUID();
          await ctx.db.insert(schema.appUser).values({
            id: holderId,
            email,
            fullName: 'Деактивований користувач',
            isActive: false,
            activatedAt: ctx.clock.now(),
            deactivatedAt: ctx.clock.now(),
          });
        }
        const response = await post({
          email: email.toUpperCase(),
          fullName: 'Повторне запрошення',
          roles: [{ role: 'RECRUITER', verticalId: user.verticalId }],
        });
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.code).toBe(code);
        // Only the deactivated holder is named, so the dialog can open its card for «Активувати знову» (D42, U3).
        if (holderId) expect(body.details).toEqual({ userId: holderId });
        else expect(body).not.toHaveProperty('details');
        expect(args.provider.sentEmails).toHaveLength(0);
      });
    },
  );

  it.each([
    ['a global role with a vertical', 'ADMIN', 'own'],
    ['a vertical role without a vertical', 'RECRUITER', null],
    ['an unknown vertical', 'RECRUITER', 'unknown'],
    ['a custom role', 'custom:sourcer', 'own'],
    ['duplicate assignments', 'DUPLICATE', 'own'],
  ] as const)('rejects %s with 400', async (_case, role, vertical) => {
    await fixture.run(async (args) => {
      const post = await asAdmin(args, { aal: 'aal2', verified: true });
      const verticalId =
        vertical === 'own'
          ? args.user.verticalId
          : vertical === 'unknown'
            ? randomUUID()
            : null;
      const roles =
        role === 'DUPLICATE'
          ? [
              { role: 'RECRUITER', verticalId },
              { role: 'RECRUITER', verticalId },
            ]
          : [{ role, verticalId }];
      const email = `${randomUUID()}@fixture.test`;
      const response = await post({ email, fullName: 'Хибні ролі', roles });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body.roles', code: 'invalid_roles' }],
      });
      expect(args.provider.sentEmails).toHaveLength(0);
      expect(
        await args.ctx.db
          .select()
          .from(schema.appUser)
          .where(eq(schema.appUser.email, email)),
      ).toHaveLength(0);
    });
  });
});
