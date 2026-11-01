import 'server-only';
import { and, asc, eq, isNotNull, like } from 'drizzle-orm';
import type { AuthCookieStore } from '@/server/auth/cookies';
import type { SystemContext } from '@/server/context/request-context';
import { getDb } from '@/server/db';
import { appUser, userRole, vertical } from '@/server/db/schema';
import { NotFoundError, UnauthenticatedError } from '@/server/http/errors';
import { authDependencies } from '@/server/services/auth/app';
import { establishSession, landingPath } from '@/server/services/auth/session';
import { totpCode } from './totp';

const DEMO_EMAIL = /^[a-z0-9._-]+@demo$/;
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * DEV-1 / DG-12b: this module is reachable only from `*.dev.ts(x)` routes, which `next build` never
 * compiles; the runtime check is a second lock for a misconfigured `next dev` against hosted Supabase.
 */
export function devLoginAvailable(): boolean {
  const url = process.env.SUPABASE_URL;
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.APP_ENV === 'local' &&
    Boolean(url) &&
    loopback.has(new URL(url!).hostname)
  );
}

export async function listDevUsers() {
  if (!devLoginAvailable()) throw new NotFoundError();
  const rows = await getDb()
    .select({
      email: appUser.email,
      fullName: appUser.fullName,
      role: userRole.role,
      vertical: vertical.name,
    })
    .from(appUser)
    .leftJoin(userRole, eq(userRole.userId, appUser.id))
    .leftJoin(vertical, eq(vertical.id, userRole.verticalId))
    .where(
      and(
        like(appUser.email, '%@demo'),
        eq(appUser.isActive, true),
        isNotNull(appUser.authUserId),
      ),
    )
    .orderBy(asc(appUser.email), asc(userRole.role));
  const users = new Map<string, { email: string; fullName: string; roles: { role: string; vertical: string | null }[] }>();
  for (const row of rows) {
    const user = users.get(row.email) ?? { email: row.email, fullName: row.fullName, roles: [] };
    if (row.role) user.roles.push({ role: row.role, vertical: row.vertical });
    users.set(row.email, user);
  }
  return [...users.values()];
}

/**
 * Real GoTrue sessions only (T4-H02/H03): a server-issued magic-link token, then, for users with the
 * seeded local TOTP factor, a real challenge with the local-only secret. Nothing in authz is bypassed.
 */
export async function devSignIn(
  ctx: SystemContext,
  email: string,
  cookies: AuthCookieStore,
): Promise<{ redirectTo: string }> {
  if (!devLoginAvailable() || !DEMO_EMAIL.test(email)) throw new NotFoundError();
  const known = (await listDevUsers()).some((user) => user.email === email);
  if (!known) throw new NotFoundError();
  const deps = authDependencies;
  const tokenHash = await deps.admin().magicLinkTokenHash(email);
  const client = deps.createClient(cookies);
  let session = tokenHash ? await client.verifyMagicLink(tokenHash) : null;
  if (!session) throw new UnauthenticatedError();
  const secret = process.env.DEV_DEMO_TOTP_SECRET;
  const factor = (await client.listTotpFactors())?.find((f) => f.status === 'verified');
  if (factor && secret) session = (await client.verifyTotp(factor.id, totpCode(secret))) ?? session;
  const { auth } = await establishSession(deps, ctx, {
    accessToken: session.accessToken,
    method: 'DEV',
    cookies,
    client,
  });
  return { redirectTo: landingPath(auth) };
}
