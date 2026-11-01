import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthCookieStore } from '../../server/auth/cookies';
import { generateInviteToken } from '../../server/auth/invite-token';
import * as schema from '../../server/db/schema';
import { consumeInvite } from '../../server/repositories/auth';
import {
  completeInviteGoogle,
  acceptInvite,
} from '../../server/services/auth/invite';
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
});
