import 'server-only';
import { redirect } from 'next/navigation';
import { getRequestContext } from '@/server/context/app';
import type { RequestContext } from '@/server/context/request-context';
import { UnauthenticatedError } from '@/server/http/errors';
import { safeNextPath } from './safe-redirect';

export interface PageGuardOptions {
  /** Current path, restored after sign-in (SEC-AUTH-4). */
  readonly next?: string;
  /** Admin/Finance pages: any withheld grant sends the user to TOTP first (SEC-AUTH-3). */
  readonly privileged?: boolean;
  /** Only for the MFA pages themselves. */
  readonly allowMfaPending?: boolean;
}

function loginUrl(next: string | undefined, reason?: string) {
  const params = new URLSearchParams();
  const path = safeNextPath(next, '');
  if (path) params.set('next', path);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

/**
 * Page/layout entry point for signed-in screens: unauthenticated → «Вхід», expired → «Сесію
 * завершено», deactivated → «Вхід» with a reason. A user whose only grants wait for aal2 (pure
 * Admin/Finance) goes to TOTP; mixed-role users keep their other pages until then (D63).
 */
export async function requirePageSession(
  options: PageGuardOptions = {},
): Promise<RequestContext> {
  let ctx: RequestContext;
  try {
    ctx = await getRequestContext();
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) throw error;
    if (error.code === 'SESSION_EXPIRED') redirect('/session-expired');
    if (error.code === 'USER_DEACTIVATED')
      redirect(loginUrl(undefined, 'deactivated'));
    redirect(loginUrl(options.next));
  }
  const pending = ctx.auth.mfaRequired && !options.allowMfaPending;
  if (pending && (options.privileged || ctx.auth.grants.size === 0)) {
    const next = safeNextPath(options.next, '');
    redirect(next ? `/mfa/verify?next=${encodeURIComponent(next)}` : '/mfa/verify');
  }
  return ctx;
}
