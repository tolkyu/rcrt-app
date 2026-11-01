import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { AuthAdmin } from '../../server/auth/admin';
import type { AuthClient, TotpFactor } from '../../server/auth/client';
import type { AuthCookieStore } from '../../server/auth/cookies';
import { createSupabaseIdentityVerifier } from '../../server/auth/supabase-identity';
import type { EmailMessage } from '../../server/integrations/email/transport';
import type { AuthDependencies } from '../../server/services/auth/deps';
import { identityToken } from '../unit/auth/jwks-fixture';
import type { startJwksFixture } from '../unit/auth/jwks-fixture';

type Jwks = Awaited<ReturnType<typeof startJwksFixture>>;

export const TEST_RATE_SECRET = 'integration-only-rate-limit-secret-0123456789';
export const TEST_APP_URL = 'https://hiring.fixture.test';

/**
 * Supabase Auth stand-in for integration tests: issues real ES256 tokens from the JWKS fixture and
 * keeps `auth.sessions` rows in the disposable database, so app code runs its real checks.
 */
export class FakeAuthServer {
  readonly users = new Map<string, string>();
  readonly tokens = new Map<string, string>();
  readonly factors = new Map<string, (TotpFactor & { code: string })[]>();
  readonly banned = new Set<string>();
  readonly sentEmails: EmailMessage[] = [];
  readonly sessions = new Set<string>();
  sendResult = true;
  sendError: Error | null = null;
  issueToken = true;
  googleExchange: Awaited<ReturnType<AuthClient['exchangeCode']>> = null;

  constructor(
    private readonly jwks: Jwks,
    private readonly sql: postgres.Sql,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issueSession(
    authUserId: string,
    aal: 'aal1' | 'aal2' = 'aal1',
    sessionId = randomUUID(),
  ) {
    await this
      .sql`insert into auth.sessions (id, user_id, not_after, created_at)
      values (${sessionId}, ${authUserId}, null, ${this.now()}) on conflict (id) do nothing`;
    this.sessions.add(sessionId);
    const accessToken = await identityToken(this.jwks, {
      sub: authUserId,
      session_id: sessionId,
      aal,
    });
    return { accessToken, sessionId };
  }

  async cleanup() {
    if (this.sessions.size)
      await this
        .sql`delete from auth.sessions where id in ${this.sql([...this.sessions])}`;
  }

  admin(): AuthAdmin {
    return {
      magicLinkTokenHash: async (email, expectedAuthUserId?: string) => {
        const authUserId = this.users.get(email);
        if (
          !this.issueToken ||
          !authUserId ||
          (expectedAuthUserId && authUserId !== expectedAuthUserId)
        )
          return null;
        const hash = randomUUID()
          .replaceAll('-', '')
          .padEnd(56, '0')
          .slice(0, 56);
        for (const [key, owner] of this.tokens)
          if (owner === authUserId) this.tokens.delete(key);
        this.tokens.set(hash, authUserId);
        return hash;
      },
      ensureUser: async (email) => {
        const existing = this.users.get(email);
        if (existing) return existing;
        const id = randomUUID();
        this.users.set(email, id);
        return id;
      },
      setBanned: async (authUserId, banned) => {
        if (banned) this.banned.add(authUserId);
        else this.banned.delete(authUserId);
        return true;
      },
      listTotpFactorIds: async (authUserId) =>
        (this.factors.get(authUserId) ?? []).map((factor) => ({
          id: factor.id,
          name: factor.friendlyName,
          verified: factor.status === 'verified',
        })),
      deleteFactor: async (authUserId, factorId) => {
        const list = this.factors.get(authUserId) ?? [];
        this.factors.set(
          authUserId,
          list.filter((factor) => factor.id !== factorId),
        );
        return true;
      },
    };
  }

  /** The cookie store receives a marker cookie so tests can see whether anything was committed. */
  client(
    cookies: AuthCookieStore,
    current: {
      authUserId: string;
      sessionId: string;
      aal?: 'aal1' | 'aal2';
    } | null = null,
  ): AuthClient {
    let session = current;
    const write = (token: string) =>
      cookies.setAll([
        { name: 'sb-127-auth-token', value: token, options: {} },
      ]);
    return {
      verifyMagicLink: async (tokenHash) => {
        const authUserId = this.tokens.get(tokenHash);
        if (!authUserId || this.banned.has(authUserId)) return null;
        this.tokens.delete(tokenHash);
        const issued = await this.issueSession(authUserId);
        session = { authUserId, sessionId: issued.sessionId };
        write(issued.accessToken);
        return { accessToken: issued.accessToken };
      },
      googleAuthorizeUrl: async () =>
        'https://accounts.google.com/o/oauth2/v2/auth?fixture=1',
      exchangeCode: async () => {
        if (this.googleExchange) write(this.googleExchange.accessToken);
        return this.googleExchange;
      },
      currentAccessToken: async () =>
        session
          ? await identityToken(this.jwks, {
              sub: session.authUserId,
              session_id: session.sessionId,
              aal: session.aal ?? 'aal1',
            })
          : null,
      signOut: async () => true,
      listTotpFactors: async () =>
        session
          ? (this.factors.get(session.authUserId) ?? []).map(
              ({ id, friendlyName, status }) => ({ id, friendlyName, status }),
            )
          : null,
      enrollTotp: async (friendlyName) => {
        if (!session) return null;
        const factor = {
          id: randomUUID(),
          friendlyName,
          status: 'unverified' as const,
          code: '123456',
        };
        this.factors.set(session.authUserId, [
          ...(this.factors.get(session.authUserId) ?? []),
          factor,
        ]);
        return {
          factorId: factor.id,
          qrCode: 'data:image/svg+xml;utf-8,<svg/>',
          secret: 'FIXTURESECRET',
        };
      },
      verifyTotp: async (factorId, code) => {
        if (!session) return null;
        const factor = (this.factors.get(session.authUserId) ?? []).find(
          (f) => f.id === factorId,
        );
        if (!factor || factor.code !== code) return null;
        this.factors.set(
          session.authUserId,
          (this.factors.get(session.authUserId) ?? []).map((entry) =>
            entry.id === factorId ? { ...entry, status: 'verified' } : entry,
          ),
        );
        const accessToken = await identityToken(this.jwks, {
          sub: session.authUserId,
          session_id: session.sessionId,
          aal: 'aal2',
        });
        write(accessToken);
        return { accessToken };
      },
    };
  }

  dependencies(
    current: {
      authUserId: string;
      sessionId: string;
      aal?: 'aal1' | 'aal2';
    } | null = null,
  ): AuthDependencies {
    return {
      createClient: (cookies) => this.client(cookies, current),
      admin: () => this.admin(),
      verifyIdentity: createSupabaseIdentityVerifier({
        supabaseUrl: this.jwks.origin,
      }),
      sendEmail: async (message) => {
        this.sentEmails.push(message);
        if (this.sendError) throw this.sendError;
        return this.sendResult;
      },
      appUrl: () => TEST_APP_URL,
      rateLimitSecret: () => TEST_RATE_SECRET,
      googleEnabled: () => true,
    };
  }
}
