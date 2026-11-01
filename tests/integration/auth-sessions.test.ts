import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthCookieStore } from '../../server/auth/cookies';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { endOtherSessions, logout } from '../../server/services/auth/session';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';

let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await Promise.all([jwks.stop(), fixture.close()]);
});

describe('Application session lifetime and revocation [SEC-AUTH-4, D23]', () => {
  it('permits 12 hours minus one millisecond and revokes at the exact idle boundary', async () => {
    await fixture.run(async ({ ctx, identity, user, at }) => {
      const started = ctx.clock.now().getTime();
      at(new Date(started + 12 * 3600_000 - 1));
      expect(
        (
          await loadAuthContext(ctx.db, identity, ctx.clock, {
            meta: { ...ctx, background: true },
          })
        ).userId,
      ).toBe(user.id);
      at(new Date(started + 12 * 3600_000));
      await expect(
        loadAuthContext(ctx.db, identity, ctx.clock, { meta: ctx }),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      const [ended] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(ended).toMatchObject({
        endReason: 'IDLE',
        endedAt: ctx.clock.now(),
      });
      expect(
        await ctx.db
          .select()
          .from(schema.authSessionStatus)
          .where(eq(schema.authSessionStatus.id, user.sessionId)),
      ).toHaveLength(0);
      const [audit] = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.requestId, ctx.requestId));
      expect(audit?.details).toEqual({ reason: 'IDLE' });
    });
  });

  it('uses the original provider session start for the exact seven-day limit even after app activity is refreshed', async () => {
    await fixture.run(async ({ ctx, identity, user, at }) => {
      const started = ctx.clock.now().getTime();
      at(new Date(started + 7 * 86400_000 - 1));
      await ctx.db
        .update(schema.userSession)
        .set({ startedAt: ctx.clock.now(), lastSeenAt: ctx.clock.now() })
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(
        (await loadAuthContext(ctx.db, identity, ctx.clock, { meta: ctx }))
          .userId,
      ).toBe(user.id);
      at(new Date(started + 7 * 86400_000));
      await expect(
        loadAuthContext(ctx.db, identity, ctx.clock, { meta: ctx }),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      const [ended] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(ended?.endReason).toBe('ABSOLUTE');
      expect(
        await ctx.db
          .select()
          .from(schema.authSessionStatus)
          .where(eq(schema.authSessionStatus.id, user.sessionId)),
      ).toHaveLength(0);
    });
  });

  it('refreshes foreground activity after sixty seconds while background requests do not extend idle time', async () => {
    await fixture.run(async ({ ctx, identity, user, at }) => {
      const started = ctx.clock.now();
      at(new Date(started.getTime() + 60_001));
      await loadAuthContext(ctx.db, identity, ctx.clock, {
        meta: { ...ctx, background: true },
      });
      const [untouched] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(untouched?.lastSeenAt).toEqual(started);
      await loadAuthContext(ctx.db, identity, ctx.clock, { meta: ctx });
      const [touched] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(touched?.lastSeenAt).toEqual(ctx.clock.now());
      at(new Date(ctx.clock.now().getTime() + 59_000));
      await loadAuthContext(ctx.db, identity, ctx.clock, { meta: ctx });
      const [throttled] = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.sessionId, user.sessionId));
      expect(throttled?.lastSeenAt).toEqual(touched?.lastSeenAt);
    });
  });

  it('requires the app session as well as a live provider session', async () => {
    await fixture.run(async ({ ctx, identity, user, provider }) => {
      const unregistered = await provider.issueSession(user.authUserId);
      const missing = { ...identity, sessionId: unregistered.sessionId };
      await expect(
        loadAuthContext(ctx.db, missing, ctx.clock),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      expect(
        (
          await loadAuthContext(ctx.db, missing, ctx.clock, {
            requireAppSession: false,
          })
        ).userId,
      ).toBe(user.id);
    });
  });

  it('withholds Admin grants at aal1 while retaining Recruiter grants, including during a TOTP lock', async () => {
    await fixture.run(async ({ ctx, identity, user, markMfaVerified }) => {
      await ctx.db
        .insert(schema.userRole)
        .values({ userId: user.id, role: 'ADMIN', verticalId: null });
      await markMfaVerified();
      const aal1 = await loadAuthContext(ctx.db, identity, ctx.clock);
      expect(aal1.grants.has('vertical.read')).toBe(true);
      expect(aal1.grants.has('audit.read')).toBe(false);
      expect(aal1.mfaRequired).toBe(true);
      const elevated = await loadAuthContext(
        ctx.db,
        { ...identity, aal: 'aal2' },
        ctx.clock,
      );
      expect(elevated.grants.has('audit.read')).toBe(true);
      await ctx.db
        .update(schema.appUser)
        .set({ mfaLockedUntil: new Date(ctx.clock.now().getTime() + 900_000) })
        .where(eq(schema.appUser.id, user.id));
      const locked = await loadAuthContext(
        ctx.db,
        { ...identity, aal: 'aal2' },
        ctx.clock,
      );
      expect(locked.grants.has('audit.read')).toBe(false);
      expect(locked.grants.has('vertical.read')).toBe(true);
    });
  });

  it('ends other sessions without revoking the caller and logs out the caller server-side', async () => {
    await fixture.run(async ({ ctx, provider, identity, user }) => {
      const other = await provider.issueSession(user.authUserId);
      await ctx.db.insert(schema.userSession).values({
        sessionId: other.sessionId,
        userId: user.id,
        method: 'GOOGLE',
        startedAt: ctx.clock.now(),
        lastSeenAt: ctx.clock.now(),
      });
      const auth = await loadAuthContext(ctx.db, identity, ctx.clock);
      expect(await endOtherSessions({ ...ctx, identity, auth })).toEqual({
        count: 1,
      });
      expect((await loadAuthContext(ctx.db, identity, ctx.clock)).userId).toBe(
        user.id,
      );
      await expect(
        loadAuthContext(
          ctx.db,
          { ...identity, sessionId: other.sessionId },
          ctx.clock,
        ),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      const cookies = createAuthCookieStore(
        new Headers({ cookie: 'sb-127-auth-token=synthetic-session' }),
        TEST_APP_URL,
      );
      expect(
        await logout(
          provider.dependencies({
            authUserId: user.authUserId,
            sessionId: user.sessionId,
          }),
          ctx,
          cookies,
        ),
      ).toEqual({ redirectTo: '/login' });
      await expect(
        loadAuthContext(ctx.db, identity, ctx.clock),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      const response = new Response();
      cookies.apply(response);
      expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0');
    });
  });
});
