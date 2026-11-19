import type { AuthCookieStore } from '@/server/auth/cookies';
import { emailsMatch } from '@/server/auth/email';
import type { SystemContext } from '@/server/context/request-context';
import { NotFoundError } from '@/server/http/errors';
import { endAuthSessions, findUserByAuthId } from '@/server/repositories/auth';
import { AUTH_LIMITS, consumeRateLimit } from '@/server/security/rate-limit';
import type { AuthDependencies } from './deps';
import {
  INVITE_COOKIE,
  clearInviteCookie,
  completeInviteGoogle,
} from './invite';
import {
  auditLoginFailure,
  establishSession,
  postSignInPath,
  withRateLimitAudit,
} from './session';

export async function startGoogle(
  deps: AuthDependencies,
  ctx: SystemContext,
  cookies: AuthCookieStore,
): Promise<{ url: string }> {
  if (!deps.googleEnabled()) throw new NotFoundError();
  await withRateLimitAudit(ctx, 'GOOGLE', () =>
    consumeRateLimit(ctx.db, ctx.clock.now(), deps.rateLimitSecret(), [
      {
        namespace: 'auth:google:ip',
        value: ctx.ip,
        limit: AUTH_LIMITS.googlePerIp,
      },
    ]),
  );
  const url = await deps
    .createClient(cookies)
    .googleAuthorizeUrl(new URL('/auth/callback', deps.appUrl()).href);
  if (!url) throw new Error('Google authorization unavailable');
  cookies.commit();
  return { url };
}

const refused = '/login?reason=google_mismatch';
const failed = '/login?reason=google_failed';

/**
 * OAuth callback (T4-D01/D02): PKCE exchange server-side, then the session survives only for an
 * active, invite-accepted user whose verified Google email equals the app email — or, with an invite
 * hand-off cookie, the invite email. Anything else deletes the session and shows a neutral message.
 */
export async function completeGoogleCallback(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: { code: string | null; error: string | null },
  cookies: AuthCookieStore,
): Promise<string> {
  const inviteToken =
    cookies.getAll().find((cookie) => cookie.name === INVITE_COOKIE)?.value ??
    null;
  const finish = (path: string) => {
    clearInviteCookie(cookies);
    return path;
  };
  // A cross-site GET can reach these paths, so they never sign the browser out (SEC-AUTH-R05).
  if (!deps.googleEnabled()) {
    cookies.abandonHandoff();
    return finish(failed);
  }
  if (input.error || !input.code) {
    cookies.abandonHandoff();
    await auditLoginFailure(ctx, 'GOOGLE', 'PROVIDER_REFUSED');
    return finish(refused);
  }
  const client = deps.createClient(cookies);
  const exchanged = await client.exchangeCode(input.code);
  const identity = exchanged
    ? await deps.verifyIdentity(
        new Headers({ authorization: `Bearer ${exchanged.accessToken}` }),
      )
    : null;
  if (!exchanged || !identity) {
    cookies.abandonHandoff();
    await auditLoginFailure(ctx, 'GOOGLE', 'EXCHANGE_FAILED');
    return finish(failed);
  }
  const google = {
    email: exchanged.googleEmail,
    verified: exchanged.googleEmailVerified,
  };
  const user = await findUserByAuthId(ctx.db, identity.authUserId);
  const allowed = inviteToken
    ? await completeInviteGoogle(ctx, inviteToken, identity, google)
    : Boolean(
        user?.isActive &&
        user.activatedAt &&
        google.verified &&
        emailsMatch(google.email, user.email),
      );
  if (!allowed) {
    await endAuthSessions(ctx.db, identity.authUserId, {
      only: identity.sessionId,
    });
    cookies.abandonHandoff();
    await auditLoginFailure(ctx, 'GOOGLE', 'EMAIL_MISMATCH', user?.id ?? null);
    return finish(refused);
  }
  try {
    const { auth } = await establishSession(deps, ctx, {
      accessToken: exchanged.accessToken,
      method: 'GOOGLE',
      cookies,
      client,
    });
    return finish(postSignInPath(auth));
  } catch {
    return finish(refused);
  }
}
