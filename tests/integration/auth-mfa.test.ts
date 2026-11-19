import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthCookieStore } from '../../server/auth/cookies';
import {
  loadAuthContext,
  resolveRequestContext,
} from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { reserveMfaAttempt } from '../../server/security/rate-limit';
import {
  enrollTotp,
  verifyTotp,
  resetUserMfa,
} from '../../server/services/auth/mfa';
import {
  establishSession,
  postSignInPath,
} from '../../server/services/auth/session';
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
        const bucketsBefore = await ctx.db
          .select()
          .from(schema.rateLimitBucket);
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
        const buckets = await ctx.db.select().from(schema.rateLimitBucket);
        expect(buckets).toEqual(bucketsBefore);
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
      await fixture.run(
        async ({ ctx, provider, identity, user, markMfaVerified }) => {
          await ctx.db
            .insert(schema.userRole)
            .values({ userId: user.id, role: 'ADMIN', verticalId: null });
          await markMfaVerified();
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
          ).rejects.toMatchObject({
            status: 503,
            code: 'MFA_RESET_INCOMPLETE',
          });
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
        },
      );
    },
  );
});

type FixtureArgs = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];

/** Another activated user with a live provider + app session, two factors and an active TOTP lock. */
async function resetTarget({ ctx, provider }: FixtureArgs) {
  const target = {
    id: randomUUID(),
    authUserId: randomUUID(),
    email: `${randomUUID()}@fixture.test`,
    fullName: 'Ціль скидання',
  };
  await ctx.db.insert(schema.appUser).values({
    ...target,
    activatedAt: ctx.clock.now(),
    mfaLockedUntil: new Date(ctx.clock.now().getTime() + 900_000),
  });
  const session = await provider.issueSession(target.authUserId);
  await ctx.db.insert(schema.userSession).values({
    sessionId: session.sessionId,
    userId: target.id,
    method: 'GOOGLE',
    startedAt: ctx.clock.now(),
    lastSeenAt: ctx.clock.now(),
  });
  provider.factors.set(
    target.authUserId,
    [randomUUID(), randomUUID()].map((id) => ({
      id,
      friendlyName: 'Пристрій',
      status: 'verified' as const,
      code: '123456',
    })),
  );
  return { ...target, sessionId: session.sessionId };
}

async function adminRequest(
  args: FixtureArgs,
  aal: 'aal1' | 'aal2',
  role: 'ADMIN' | null = 'ADMIN',
) {
  if (role)
    await args.ctx.db
      .insert(schema.userRole)
      .values({ userId: args.user.id, role, verticalId: null });
  await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  const auth = await loadAuthContext(args.ctx.db, identity, args.ctx.clock);
  return { ...args.ctx, auth, identity };
}

describe('«Скинути 2FA» by an aal2 Admin [T4-F05, D22, CR-P1-05]', () => {
  it('deletes every factor, ends every session, clears the lock, records the reason only in PII rows and emails the user', async () => {
    await fixture.run(async (args) => {
      const { ctx, provider, user } = args;
      const target = await resetTarget(args);
      const reason = 'Втрачено телефон із застосунком';
      const request = await adminRequest(args, 'aal2');
      expect(
        await resetUserMfa(provider.dependencies(), request, {
          userId: target.id,
          reason,
        }),
      ).toEqual({ removedFactors: 2 });
      expect(provider.factors.get(target.authUserId)).toEqual([]);
      expect(
        await ctx.db
          .select()
          .from(schema.authSessionStatus)
          .where(eq(schema.authSessionStatus.id, target.sessionId)),
      ).toHaveLength(0);
      const [ended] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, target.sessionId));
      expect(ended).toMatchObject({
        endReason: 'MFA_RESET',
        endedAt: ctx.clock.now(),
      });
      const [unlocked] = await ctx.db
        .select()
        .from(schema.appUser)
        .where(eq(schema.appUser.id, target.id));
      expect(unlocked?.mfaLockedUntil).toBeNull();
      const events = await ctx.db
        .select()
        .from(schema.entityEvent)
        .where(eq(schema.entityEvent.subjectId, target.id));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'user.mfa_reset',
        subjectType: 'app_user',
        actorId: user.id,
        payload: { v: 1 },
      });
      expect(Object.keys(events[0]!.payload as object)).toEqual(['v']);
      const [pii] = await ctx.db
        .select()
        .from(schema.entityEventPii)
        .where(eq(schema.entityEventPii.eventId, events[0]!.id));
      expect(pii?.data).toEqual({ reason });
      const audits = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.entityId, target.id),
            eq(schema.auditLog.action, 'user.mfa_reset'),
          ),
        );
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        result: 'SUCCESS',
        entityType: 'user',
        actorId: user.id,
        after: { reason },
        details: { removedFactors: 2 },
      });
      expect(JSON.stringify(audits[0]!.details)).not.toContain(reason);
      expect(provider.sentEmails).toHaveLength(1);
      expect(provider.sentEmails[0]).toMatchObject({
        to: target.email,
        subject: 'Двофакторну автентифікацію скинуто',
      });
    });
  });

  it.each([
    ['the Admin themselves', 'self', 'aal2', 'ADMIN', 403, 'FORBIDDEN'],
    ['a non-Admin', 'other', 'aal2', null, 404, 'NOT_FOUND'],
    ['an aal1 Admin', 'other', 'aal1', 'ADMIN', 401, 'MFA_REQUIRED'],
  ] as const)(
    'refuses %s without touching factors, sessions or mail',
    async (_case, subject, aal, role, status, code) => {
      await fixture.run(async (args) => {
        const { ctx, provider, user } = args;
        const target = await resetTarget(args);
        const request = await adminRequest(args, aal, role);
        await expect(
          resetUserMfa(provider.dependencies(), request, {
            userId: subject === 'self' ? user.id : target.id,
            reason: 'Спроба без права доступу',
          }),
        ).rejects.toMatchObject({ status, code });
        expect(provider.factors.get(target.authUserId)).toHaveLength(2);
        const [open] = await ctx.db
          .select()
          .from(schema.userSession)
          .where(eq(schema.userSession.sessionId, target.sessionId));
        expect(open?.endedAt).toBeNull();
        expect(
          await ctx.db
            .select()
            .from(schema.entityEvent)
            .where(eq(schema.entityEvent.type, 'user.mfa_reset')),
        ).toHaveLength(0);
        expect(provider.sentEmails).toHaveLength(0);
      });
    },
  );
});

describe('aal2 only after a TOTP verification recorded by the app [SEC-AUTH-R02]', () => {
  it('ignores an aal2 token raised directly at GoTrue until verifyTotp records the verification', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      await ctx.db
        .insert(schema.userRole)
        .values({ userId: user.id, role: 'ADMIN', verticalId: null });
      const factorId = randomUUID();
      provider.factors.set(user.authUserId, [
        {
          id: factorId,
          friendlyName: 'Пристрій',
          status: 'verified',
          code: '123456',
        },
      ]);
      const target = await ctx.db
        .insert(schema.appUser)
        .values({
          email: `${randomUUID()}@fixture.test`,
          fullName: 'Ціль без входу',
        })
        .returning({ id: schema.appUser.id });
      const direct = await provider.issueSession(
        user.authUserId,
        'aal2',
        user.sessionId,
      );
      const deps = provider.dependencies({
        authUserId: user.authUserId,
        sessionId: user.sessionId,
        aal: 'aal2',
      });
      const resolve = () =>
        resolveRequestContext(
          {
            db: () => ctx.db,
            clock: ctx.clock,
            verifyIdentity: deps.verifyIdentity,
          },
          new Headers({ authorization: `Bearer ${direct.accessToken}` }),
        );
      const before = await resolve();
      expect(before.identity.aal).toBe('aal2');
      expect(before.auth).toMatchObject({ aal: 'aal1', mfaRequired: true });
      await expect(
        resetUserMfa(deps, before, {
          userId: target[0]!.id,
          reason: 'Перевірка обходу GoTrue',
        }),
      ).rejects.toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
      expect(
        await verifyTotp(
          deps,
          before,
          { factorId, code: '123456' },
          createAuthCookieStore(new Headers(), TEST_APP_URL),
        ),
      ).toEqual({ redirectTo: '/' });
      const [session] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(session?.mfaVerifiedAt).toEqual(ctx.clock.now());
      const after = await resolve();
      expect(after.auth).toMatchObject({ aal: 'aal2', mfaRequired: false });
      expect(
        await resetUserMfa(deps, after, {
          userId: target[0]!.id,
          reason: 'Перевірка обходу GoTrue',
        }),
      ).toEqual({ removedFactors: 0 });
    });
  });

  it('records the verification at sign-in only when the server itself completed TOTP (dev login)', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      await ctx.db
        .insert(schema.userRole)
        .values({ userId: user.id, role: 'FINANCE', verticalId: null });
      for (const mfaVerified of [false, true]) {
        const issued = await provider.issueSession(user.authUserId, 'aal2');
        const cookies = createAuthCookieStore(new Headers(), TEST_APP_URL);
        const { auth } = await establishSession(provider.dependencies(), ctx, {
          accessToken: issued.accessToken,
          method: 'DEV',
          cookies,
          client: provider.client(cookies),
          mfaVerified,
        });
        expect(auth.aal).toBe(mfaVerified ? 'aal2' : 'aal1');
        expect(postSignInPath(auth)).toBe(mfaVerified ? '/' : '/mfa/verify');
        const [session] = await ctx.db
          .select()
          .from(schema.userSession)
          .where(eq(schema.userSession.sessionId, issued.sessionId));
        expect(session?.mfaVerifiedAt).toEqual(
          mfaVerified ? ctx.clock.now() : null,
        );
      }
    });
  });
});
