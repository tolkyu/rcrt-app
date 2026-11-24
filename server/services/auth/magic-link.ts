import { writeAudit } from '@/server/audit';
import type { AuthCookieStore } from '@/server/auth/cookies';
import { normalizeEmail } from '@/server/auth/email';
import type { SystemContext } from '@/server/context/request-context';
import {
  AuthEmailDeliveryFailedError,
  UnauthenticatedError,
} from '@/server/http/errors';
import { magicLinkEmail } from '@/server/integrations/email/templates';
import {
  findEligibleAuthUser,
  findUserByEmail,
} from '@/server/repositories/auth';
import {
  AUTH_LIMITS,
  consumeAuthRateLimit,
  consumeRateLimit,
} from '@/server/security/rate-limit';
import type { AuthDependencies } from './deps';
import {
  auditLoginFailure,
  establishSession,
  postSignInPath,
  withRateLimitAudit,
} from './session';

/** The owner requires delivery failures to be visible; ineligible accounts still receive a neutral success. */
export async function requestMagicLink(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: { email: string },
): Promise<{ accepted: true }> {
  const email = normalizeEmail(input.email);
  await withRateLimitAudit(ctx, 'MAGIC_LINK', () =>
    consumeAuthRateLimit(
      ctx.db,
      ctx.clock.now(),
      email,
      ctx.ip,
      deps.rateLimitSecret(),
    ),
  );
  await sendMagicLink(deps, ctx, email);
  return { accepted: true };
}

/** Supabase issues the token; delivery completes before a successful response (SEC-AUTH-1). */
export async function sendMagicLink(
  deps: AuthDependencies,
  ctx: SystemContext,
  email: string,
): Promise<void> {
  const user = await findEligibleAuthUser(ctx.db, email);
  if (!user) {
    const known = await findUserByEmail(ctx.db, email);
    await auditLoginFailure(
      ctx,
      'MAGIC_LINK',
      'NOT_ELIGIBLE',
      known?.id ?? null,
    );
    return;
  }
  let sent = false;
  try {
    const tokenHash = await deps
      .admin()
      .magicLinkTokenHash(email, user.authUserId);
    sent = tokenHash
      ? await deps.sendEmail(
          magicLinkEmail(
            email,
            `${new URL('/auth/confirm', deps.appUrl()).href}#token_hash=${tokenHash}`,
          ),
        )
      : false;
  } catch {
    sent = false;
  }
  await writeAudit(ctx.db, ctx, {
    action: sent ? 'auth.magic_link_requested' : 'auth.login_failed',
    result: sent ? 'SUCCESS' : 'DENIED',
    entityType: 'user',
    entityId: user.id,
    details: {
      method: 'MAGIC_LINK',
      reason: sent ? 'SENT' : 'DELIVERY_FAILED',
    },
  });
  if (!sent) throw new AuthEmailDeliveryFailedError();
}

/** POST from the confirm page button; a GET never reaches this, so mail scanners cannot consume links (DG-07). */
export async function confirmMagicLink(
  deps: AuthDependencies,
  ctx: SystemContext,
  input: { token_hash: string; next?: string | undefined },
  cookies: AuthCookieStore,
): Promise<{ redirectTo: string }> {
  await withRateLimitAudit(ctx, 'MAGIC_LINK', () =>
    consumeRateLimit(ctx.db, ctx.clock.now(), deps.rateLimitSecret(), [
      {
        namespace: 'auth:confirm:ip',
        value: ctx.ip,
        limit: AUTH_LIMITS.confirmPerIp,
      },
      {
        namespace: 'auth:confirm:token',
        value: input.token_hash,
        limit: AUTH_LIMITS.confirmPerToken,
      },
    ]),
  );
  const client = deps.createClient(cookies);
  const session = await client.verifyMagicLink(input.token_hash);
  if (!session) {
    cookies.discard();
    await auditLoginFailure(ctx, 'MAGIC_LINK', 'LINK_REJECTED');
    throw new UnauthenticatedError();
  }
  const { auth } = await establishSession(deps, ctx, {
    accessToken: session.accessToken,
    method: 'MAGIC_LINK',
    cookies,
    client,
  });
  return { redirectTo: postSignInPath(auth, input.next) };
}
