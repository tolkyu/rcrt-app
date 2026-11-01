import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthCookieStore } from '../../server/auth/cookies';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { reserveMfaAttempt } from '../../server/security/rate-limit';
import {
  enrollTotp,
  verifyTotp,
  resetUserMfa,
} from '../../server/services/auth/mfa';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 10, prepare: false });
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

describe('MFA session binding and failure recovery [D22, D63, T4-F04/F05]', () => {
  it('enrols and verifies the first factor, commits an aal2 session, and requires aal2 before adding a backup', async () => {
    await fixture.run(async ({ ctx, provider, identity, user }) => {
      const auth = await loadAuthContext(ctx.db, identity, ctx.clock);
      const request = { ...ctx, auth, identity };
      const deps = provider.dependencies({
        authUserId: user.authUserId,
        sessionId: user.sessionId,
      });
      const cookies = createAuthCookieStore(new Headers(), TEST_APP_URL);
      const enrolled = await enrollTotp(deps, request, cookies);
      expect(enrolled.factorId).toBeTruthy();
      expect(
        await verifyTotp(
          deps,
          request,
          { factorId: enrolled.factorId, code: '123456' },
          cookies,
        ),
      ).toEqual({ redirectTo: '/' });
      const response = new Response();
      cookies.apply(response);
      expect(response.headers.getSetCookie()).toHaveLength(1);
      expect(response.headers.getSetCookie()[0]).toContain('HttpOnly');
      const events = await ctx.db
        .select()
        .from(schema.entityEvent)
        .where(eq(schema.entityEvent.subjectId, user.id));
      expect(events.map((event) => event.type)).toEqual(['user.mfa_enrolled']);
      await expect(
        enrollTotp(
          deps,
          request,
          createAuthCookieStore(new Headers(), TEST_APP_URL),
        ),
      ).rejects.toMatchObject({ code: 'MFA_REQUIRED' });
      const elevated = { ...identity, aal: 'aal2' as const };
      const elevatedAuth = await loadAuthContext(ctx.db, elevated, ctx.clock);
      const backup = await enrollTotp(
        provider.dependencies({
          authUserId: user.authUserId,
          sessionId: user.sessionId,
          aal: 'aal2',
        }),
        { ...ctx, auth: elevatedAuth, identity: elevated },
        createAuthCookieStore(new Headers(), TEST_APP_URL),
      );
      expect(backup.factorId).not.toBe(enrolled.factorId);
    });
  });

  it.each([
    'different-user',
    'different-session',
    'different-assurance',
  ] as const)(
    'rejects %s SDK cookies before any factor operation',
    async (mismatch) => {
      await fixture.run(async ({ ctx, provider, identity, user }) => {
        const elevated = mismatch === 'different-assurance';
        const expected = {
          ...identity,
          aal: elevated ? ('aal2' as const) : ('aal1' as const),
        };
        const auth = await loadAuthContext(ctx.db, expected, ctx.clock);
        const request = { ...ctx, auth, identity: expected };
        const cookies = createAuthCookieStore(new Headers(), TEST_APP_URL);
        const sdk = provider.client(cookies, {
          authUserId:
            mismatch === 'different-user' ? randomUUID() : user.authUserId,
          sessionId:
            mismatch === 'different-session' ? randomUUID() : user.sessionId,
          aal: 'aal1',
        });
        const list = vi.fn(sdk.listTotpFactors);
        const enroll = vi.fn(sdk.enrollTotp);
        const challenge = vi.fn(sdk.verifyTotp);
        const deps = {
          ...provider.dependencies(),
          createClient: () => ({
            ...sdk,
            listTotpFactors: list,
            enrollTotp: enroll,
            verifyTotp: challenge,
          }),
        };
        await expect(enrollTotp(deps, request, cookies)).rejects.toMatchObject({
          code: 'UNAUTHENTICATED',
          status: 401,
        });
        await expect(
          verifyTotp(
            deps,
            request,
            { factorId: randomUUID(), code: '123456' },
            cookies,
          ),
        ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
        expect(list).not.toHaveBeenCalled();
        expect(enroll).not.toHaveBeenCalled();
        expect(challenge).not.toHaveBeenCalled();
      });
    },
  );

  it('locks at the fifth wrong TOTP and refuses a correct code while locked', async () => {
    await fixture.run(async ({ ctx, provider, identity, user }) => {
      const factorId = randomUUID();
      provider.factors.set(user.authUserId, [
        {
          id: factorId,
          friendlyName: 'Пристрій',
          status: 'verified',
          code: '123456',
        },
      ]);
      const auth = await loadAuthContext(ctx.db, identity, ctx.clock);
      const request = { ...ctx, auth, identity };
      const deps = provider.dependencies({
        authUserId: user.authUserId,
        sessionId: user.sessionId,
      });
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(
          verifyTotp(
            deps,
            request,
            { factorId, code: '000000' },
            createAuthCookieStore(new Headers(), TEST_APP_URL),
          ),
        ).rejects.toMatchObject({ code: 'MFA_CODE_INVALID' });
      }
      await expect(
        verifyTotp(
          deps,
          request,
          { factorId, code: '000000' },
          createAuthCookieStore(new Headers(), TEST_APP_URL),
        ),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      await expect(
        verifyTotp(
          deps,
          request,
          { factorId, code: '123456' },
          createAuthCookieStore(new Headers(), TEST_APP_URL),
        ),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      const [locked] = await ctx.db
        .select()
        .from(schema.appUser)
        .where(eq(schema.appUser.id, user.id));
      expect(locked?.mfaLockedUntil).toEqual(
        new Date(ctx.clock.now().getTime() + 900_000),
      );
    });
  });

  it('admits at most five concurrent TOTP attempts per user and locks after five failures [SEC-AUTH-C05]', async () => {
    const userId = randomUUID();
    const now = new Date('2026-11-16T08:00:00Z');
    const clock = { now: () => new Date(now) };
    const secret = 'mfa-concurrency-regression-secret-0123456789';
    try {
      await admin`insert into app.app_user (id,email,full_name,activated_at) values (${userId}, ${`${userId}@fixture.test`}, 'Паралельні спроби', ${now})`;
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          reserveMfaAttempt(concurrentDb, clock, userId, secret),
        ),
      );
      const admitted = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      expect(admitted).toHaveLength(5);
      for (const result of results)
        if (result.status === 'rejected')
          expect(result.reason).toMatchObject({ code: 'RATE_LIMITED' });
      const settled = await Promise.all(
        admitted.map((attempt) => attempt.release('invalid')),
      );
      expect(settled.filter((outcome) => outcome.newlyLocked)).toHaveLength(1);
      await expect(
        reserveMfaAttempt(concurrentDb, clock, userId, secret),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      const [stored] =
        await admin`select mfa_locked_until from app.app_user where id=${userId}`;
      expect(stored?.mfa_locked_until).toEqual(
        new Date(now.getTime() + 900_000),
      );
    } finally {
      await admin`delete from app.rate_limit_bucket where key like 'auth:mfa:%' and window_start = ${now}`;
      await admin`delete from app.app_user where id=${userId}`;
    }
  });

  it.each(['false', 'throw', 'list-null', 'list-throw'] as const)(
    'revokes sessions but never reports a partial factor deletion (%s) as success',
    async (failure) => {
      await fixture.run(async ({ ctx, provider, identity, user }) => {
        await ctx.db
          .insert(schema.userRole)
          .values({ userId: user.id, role: 'ADMIN', verticalId: null });
        const elevated = { ...identity, aal: 'aal2' as const };
        const auth = await loadAuthContext(ctx.db, elevated, ctx.clock);
        const target = {
          id: randomUUID(),
          authUserId: randomUUID(),
          email: `${randomUUID()}@fixture.test`,
        };
        const lock = new Date(ctx.clock.now().getTime() + 900_000);
        await ctx.db.insert(schema.appUser).values({
          ...target,
          fullName: 'Інший користувач',
          activatedAt: ctx.clock.now(),
          mfaLockedUntil: lock,
        });
        const session = await provider.issueSession(target.authUserId);
        await ctx.db.insert(schema.userSession).values({
          sessionId: session.sessionId,
          userId: target.id,
          method: 'GOOGLE',
          startedAt: ctx.clock.now(),
          lastSeenAt: ctx.clock.now(),
        });
        const first = randomUUID();
        const second = randomUUID();
        provider.factors.set(
          target.authUserId,
          [first, second].map((id) => ({
            id,
            friendlyName: 'Пристрій',
            status: 'verified',
            code: '123456',
          })),
        );
        const admin = provider.admin();
        const deps = {
          ...provider.dependencies(),
          admin: () => ({
            ...admin,
            listTotpFactorIds: async (authUserId: string) => {
              if (failure === 'list-null') return null;
              if (failure === 'list-throw')
                throw new Error('synthetic-provider-private-error');
              return admin.listTotpFactorIds(authUserId);
            },
            deleteFactor: async (authUserId: string, factorId: string) => {
              if (factorId === first) {
                if (failure === 'throw')
                  throw new Error('synthetic-provider-private-error');
                return false;
              }
              return admin.deleteFactor(authUserId, factorId);
            },
          }),
        };
        await expect(
          resetUserMfa(
            deps,
            { ...ctx, auth, identity: elevated },
            { userId: target.id, reason: 'Втрачено пристрій' },
          ),
        ).rejects.toMatchObject({ status: 503, code: 'MFA_RESET_INCOMPLETE' });
        expect(
          await ctx.db
            .select()
            .from(schema.authSessionStatus)
            .where(eq(schema.authSessionStatus.id, session.sessionId)),
        ).toHaveLength(0);
        const [ended] = await ctx.db
          .select()
          .from(schema.userSession)
          .where(eq(schema.userSession.sessionId, session.sessionId));
        expect(ended?.endReason).toBe('MFA_RESET');
        const [unchanged] = await ctx.db
          .select()
          .from(schema.appUser)
          .where(eq(schema.appUser.id, target.id));
        expect(unchanged?.mfaLockedUntil).toEqual(lock);
        const audits = await ctx.db
          .select()
          .from(schema.auditLog)
          .where(
            and(
              eq(schema.auditLog.requestId, ctx.requestId),
              eq(schema.auditLog.action, 'user.mfa_reset'),
            ),
          );
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          result: 'DENIED',
          details: {
            reason: 'MFA_RESET_INCOMPLETE',
            removedFactors: failure.startsWith('list-') ? 0 : 1,
            failedFactors: failure.startsWith('list-') ? 0 : 1,
            factorListingFailed: failure.startsWith('list-'),
            sessionsRevoked: true,
          },
        });
        expect(
          await ctx.db
            .select()
            .from(schema.entityEvent)
            .where(eq(schema.entityEvent.subjectId, target.id)),
        ).toHaveLength(0);
        expect(provider.sentEmails).toHaveLength(0);
        expect(JSON.stringify(audits[0]?.details)).not.toContain(
          'synthetic-provider-private-error',
        );
      });
    },
  );
});
