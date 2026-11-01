import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createSupabaseIdentityVerifier } from '../../server/auth/supabase-identity';
import { resolveRequestContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { fixedClock } from '../../server/domain/clock';
import {
  bearer,
  identityToken,
  startJwksFixture,
} from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = connectTestDatabase(urls.runtime);
const db = drizzle(client, { schema });
const rollback = Symbol('rollback signed-identity fixture');
let fixture: Awaited<ReturnType<typeof startJwksFixture>>;

beforeAll(async () => {
  fixture = await startJwksFixture();
});
afterAll(async () => {
  await Promise.all([fixture.stop(), admin.end(), client.end()]);
});

it('uses a cryptographically verified identity with current database roles, activity and session state [DG-02, DG-05, DG-10]', async () => {
  const userId = randomUUID();
  const authUserId = randomUUID();
  const sessionId = randomUUID();
  const verticalId = randomUUID();
  const clock = fixedClock(new Date());
  const verifyIdentity = createSupabaseIdentityVerifier({
    supabaseUrl: fixture.origin,
  });
  const token = await identityToken(fixture, {
    sub: authUserId,
    session_id: sessionId,
    aal: 'aal2',
    user_metadata: { role: 'ADMIN' },
    app_metadata: { roles: ['ADMIN'], verticalIds: ['all'] },
  });
  await admin`insert into auth.sessions (id, user_id, not_after) values (${sessionId}, ${authUserId}, null)`;
  const serviceToken = await identityToken(fixture, {
    sub: authUserId,
    session_id: sessionId,
    role: 'service_role',
  });
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.vertical).values({
        id: verticalId,
        name: `Криптографічна перевірка ${verticalId}`,
      });
      await tx.insert(schema.appUser).values({
        id: userId,
        authUserId,
        email: `${userId}@fixture.test`,
        fullName: 'Перевірка токена',
      });
      await tx
        .insert(schema.userRole)
        .values({ userId, role: 'RECRUITER', verticalId });
      await tx.insert(schema.userSession).values({
        sessionId,
        userId,
        method: 'MAGIC_LINK',
        startedAt: clock.now(),
        lastSeenAt: clock.now(),
        mfaVerifiedAt: clock.now(),
      });
      const deps = { db: () => tx, clock, verifyIdentity };
      const context = await resolveRequestContext(deps, bearer(token));
      expect(context.auth.userId).toBe(userId);
      expect(context.auth.grants.has('vertical.read')).toBe(true);
      expect(context.auth.grants.has('audit.read')).toBe(false);
      expect(context.auth.aal).toBe('aal2');
      expect(context.identity).toEqual({ authUserId, sessionId, aal: 'aal2' });

      await expect(
        resolveRequestContext(deps, bearer(serviceToken)),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      const unownedSession = await identityToken(fixture, {
        sub: authUserId,
        session_id: randomUUID(),
      });
      await expect(
        resolveRequestContext(deps, bearer(unownedSession)),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      const invalid = await identityToken(fixture, {
        sub: authUserId,
        session_id: sessionId,
        iss: 'https://untrusted.invalid/auth/v1',
      });
      await expect(
        resolveRequestContext(deps, bearer(invalid)),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

      await tx
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: clock.now() })
        .where(eq(schema.appUser.id, userId));
      await expect(
        resolveRequestContext(deps, bearer(token)),
      ).rejects.toMatchObject({ code: 'USER_DEACTIVATED' });
      await tx
        .update(schema.appUser)
        .set({ isActive: true, deactivatedAt: null })
        .where(eq(schema.appUser.id, userId));
      await admin`delete from auth.sessions where id = ${sessionId}`;
      await expect(
        resolveRequestContext(deps, bearer(token)),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await admin`delete from auth.sessions where id = ${sessionId}`;
  }
});
