import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthCookieStore } from '../../server/auth/cookies';
import * as schema from '../../server/db/schema';
import {
  requestMagicLink,
  confirmMagicLink,
} from '../../server/services/auth/magic-link';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
import { identityToken, startJwksFixture } from '../unit/auth/jwks-fixture';

let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
const cookieStore = () => createAuthCookieStore(new Headers(), TEST_APP_URL);
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await Promise.all([jwks.stop(), fixture.close()]);
});

describe('Magic-link services with real database principals and a provider boundary [STORY-SEC-AUTH-1]', () => {
  it('returns neutral success for active, unknown, inactive and pending users; sends only to eligible users', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const inactive = `${randomUUID()}@fixture.test`;
      const pending = `${randomUUID()}@fixture.test`;
      await ctx.db.insert(schema.appUser).values([
        {
          email: inactive,
          fullName: 'Деактивований',
          isActive: false,
          deactivatedAt: ctx.clock.now(),
        },
        { email: pending, fullName: 'Запрошений' },
      ]);
      for (const email of [
        user.email.toUpperCase(),
        `${randomUUID()}@fixture.test`,
        inactive,
        pending,
      ]) {
        expect(
          await requestMagicLink(provider.dependencies(), ctx, { email }),
        ).toEqual({ accepted: true });
      }
      expect(provider.sentEmails).toHaveLength(1);
      expect(JSON.stringify(provider.sentEmails[0])).toContain(user.email);
      const audits = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.requestId, ctx.requestId));
      expect(audits).toHaveLength(4);
      expect(audits.filter((audit) => audit.result === 'DENIED')).toHaveLength(
        3,
      );
      expect(
        JSON.stringify(audits.map((audit) => audit.details)),
      ).not.toContain(user.email);
    });
  });

  it.each(['send-false', 'send-throw', 'token-missing'] as const)(
    'returns a safe 503 on eligible delivery failure: %s',
    async (failure) => {
      await fixture.run(async ({ ctx, provider, user }) => {
        if (failure === 'send-false') provider.sendResult = false;
        if (failure === 'send-throw')
          provider.sendError = new Error('synthetic-provider-private-error');
        if (failure === 'token-missing') provider.issueToken = false;
        await expect(
          requestMagicLink(provider.dependencies(), ctx, { email: user.email }),
        ).rejects.toMatchObject({
          status: 503,
          code: 'AUTH_EMAIL_DELIVERY_FAILED',
          message: 'AUTH_EMAIL_DELIVERY_FAILED',
        });
        const [audit] = await ctx.db
          .select()
          .from(schema.auditLog)
          .where(eq(schema.auditLog.requestId, ctx.requestId));
        expect(audit).toMatchObject({
          action: 'auth.login_failed',
          result: 'DENIED',
          details: { method: 'MAGIC_LINK', reason: 'DELIVERY_FAILED' },
        });
        expect(JSON.stringify(audit?.details)).not.toContain(
          'synthetic-provider-private-error',
        );
      });
    },
  );

  it('verifies a real JWT, establishes an app session and commits only a redirect DTO', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const tokenHash = await provider.admin().magicLinkTokenHash(user.email);
      const cookies = cookieStore();
      const result = await confirmMagicLink(
        provider.dependencies(),
        ctx,
        { token_hash: tokenHash! },
        cookies,
      );
      expect(result).toEqual({ redirectTo: '/' });
      const response = Response.json(result);
      cookies.apply(response);
      expect(response.headers.getSetCookie()).toHaveLength(1);
      expect(response.headers.getSetCookie()[0]).toContain('HttpOnly');
      const text = await response.text();
      expect(text).not.toContain('access_token');
      expect(text).not.toContain(tokenHash!);
      const sessions = await ctx.db
        .select()
        .from(schema.userSession)
        .where(eq(schema.userSession.userId, user.id));
      expect(sessions).toHaveLength(2);
      const [audit] = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.requestId, ctx.requestId));
      expect(audit).toMatchObject({
        action: 'auth.login_succeeded',
        actorId: user.id,
        details: { method: 'MAGIC_LINK' },
      });
    });
  });

  it('accepts a separate cookie store and rejects provider replay without committing another session', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const tokenHash = await provider.admin().magicLinkTokenHash(user.email);
      await confirmMagicLink(
        provider.dependencies(),
        ctx,
        { token_hash: tokenHash! },
        cookieStore(),
      );
      const cookies = cookieStore();
      await expect(
        confirmMagicLink(
          provider.dependencies(),
          ctx,
          { token_hash: tokenHash! },
          cookies,
        ),
      ).rejects.toMatchObject({ status: 401 });
      const response = new Response();
      cookies.apply(response);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });
  });

  it('rejects an old provider token after a replacement token has been issued', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const previous = await provider.admin().magicLinkTokenHash(user.email);
      const latest = await provider.admin().magicLinkTokenHash(user.email);
      await expect(
        confirmMagicLink(
          provider.dependencies(),
          ctx,
          { token_hash: previous! },
          cookieStore(),
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(
        await confirmMagicLink(
          provider.dependencies(),
          ctx,
          { token_hash: latest! },
          cookieStore(),
        ),
      ).toEqual({ redirectTo: '/' });
    });
  });

  it('rejects deactivation between issuance and confirmation and clears the uncommitted provider session', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const tokenHash = await provider.admin().magicLinkTokenHash(user.email);
      await ctx.db
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: ctx.clock.now() })
        .where(eq(schema.appUser.id, user.id));
      const cookies = cookieStore();
      await expect(
        confirmMagicLink(
          provider.dependencies(),
          ctx,
          { token_hash: tokenHash! },
          cookies,
        ),
      ).rejects.toMatchObject({ code: 'USER_DEACTIVATED' });
      const response = new Response();
      cookies.apply(response);
      expect(
        response.headers
          .getSetCookie()
          .every((cookie) => cookie.includes('Max-Age=0')),
      ).toBe(true);
      const [audit] = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.requestId, ctx.requestId));
      expect(audit).toMatchObject({
        action: 'auth.login_failed',
        details: { method: 'MAGIC_LINK', reason: 'DEACTIVATED' },
      });
    });
  });

  it('does not commit provider cookies when the returned token fails cryptographic issuer verification', async () => {
    await fixture.run(async ({ ctx, provider, user }) => {
      const dependencies = provider.dependencies();
      const cookies = cookieStore();
      const client = provider.client(cookies);
      const token = await identityToken(jwks, {
        sub: user.authUserId,
        session_id: user.sessionId,
        iss: 'https://untrusted.invalid/auth/v1',
      });
      await expect(
        confirmMagicLink(
          {
            ...dependencies,
            createClient: () => ({
              ...client,
              verifyMagicLink: async () => ({ accessToken: token }),
            }),
          },
          ctx,
          { token_hash: 'a'.repeat(56) },
          cookies,
        ),
      ).rejects.toMatchObject({ status: 401 });
      const response = new Response();
      cookies.apply(response);
      expect(
        response.headers
          .getSetCookie()
          .every((cookie) => cookie.includes('Max-Age=0')),
      ).toBe(true);
    });
  });
});
