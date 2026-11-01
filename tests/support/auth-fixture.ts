import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SystemContext } from '../../server/context/request-context';
import type { VerifiedIdentity } from '../../server/context/identity';
import * as schema from '../../server/db/schema';
import { connectTestDatabase, testDatabaseUrls } from '../integration/database';
import { FakeAuthServer } from './auth-fakes';
import type { startJwksFixture } from '../unit/auth/jwks-fixture';

const rollback = Symbol('rollback auth fixture');
export function createAuthFixture(
  jwks: Awaited<ReturnType<typeof startJwksFixture>>,
) {
  const urls = testDatabaseUrls();
  const admin = connectTestDatabase(urls.migration);
  const client = connectTestDatabase(urls.runtime);
  const db = drizzle(client, { schema });
  async function run(
    scenario: (fixture: {
      ctx: SystemContext;
      provider: FakeAuthServer;
      user: {
        id: string;
        authUserId: string;
        email: string;
        sessionId: string;
        verticalId: string;
        token: string;
      };
      identity: VerifiedIdentity;
      at: (value: Date) => void;
      /** Records the app-side TOTP verification that `verifyTotp` writes (SEC-AUTH-R02). */
      markMfaVerified: (sessionId?: string) => Promise<void>;
    }) => Promise<void>,
  ) {
    let current = new Date('2026-11-16T08:00:00Z');
    const clock = { now: () => new Date(current) };
    const provider = new FakeAuthServer(jwks, admin, clock.now);
    const authUserId = randomUUID();
    const session = await provider.issueSession(authUserId);
    const user = {
      id: randomUUID(),
      authUserId,
      email: `${randomUUID()}@fixture.test`,
      sessionId: session.sessionId,
      verticalId: randomUUID(),
      token: session.accessToken,
    };
    provider.users.set(user.email, authUserId);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.vertical).values({
          id: user.verticalId,
          name: `Вертикаль ${user.verticalId}`,
        });
        await tx.insert(schema.appUser).values({
          id: user.id,
          authUserId,
          email: user.email,
          fullName: 'Тестовий користувач',
          activatedAt: clock.now(),
        });
        await tx.insert(schema.userRole).values({
          userId: user.id,
          role: 'RECRUITER',
          verticalId: user.verticalId,
        });
        await tx.insert(schema.userSession).values({
          sessionId: user.sessionId,
          userId: user.id,
          method: 'MAGIC_LINK',
          startedAt: clock.now(),
          lastSeenAt: clock.now(),
        });
        const ctx: SystemContext = {
          auth: null,
          db: tx,
          clock,
          requestId: randomUUID(),
          ip: null,
          userAgent: 'Auth integration QA',
          mutationId: null,
        };
        await scenario({
          ctx,
          provider,
          user,
          identity: { authUserId, sessionId: user.sessionId, aal: 'aal1' },
          at: (value) => {
            current = new Date(value);
          },
          markMfaVerified: async (sessionId = user.sessionId) => {
            await tx
              .update(schema.userSession)
              .set({ mfaVerifiedAt: clock.now() })
              .where(eq(schema.userSession.sessionId, sessionId));
          },
        });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await provider.cleanup();
    }
  }
  return { run, close: () => Promise.all([admin.end(), client.end()]) };
}
