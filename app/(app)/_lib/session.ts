import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { requirePageSession } from '@/server/auth/page-guard';

async function currentPath() {
  return (await headers()).get('x-pathname') ?? undefined;
}

/**
 * Every (app) layout and page starts here: T4's guard (sign-in, expiry, deactivation, MFA for pure
 * Admin/Finance) once per request; `x-pathname` from middleware restores the page after sign-in.
 */
export const requireSession = cache(async () =>
  requirePageSession({ next: await currentPath() }),
);

/** Admin/Finance pages: any withheld grant sends the user to TOTP first, even with other roles (D63). */
export const requirePrivilegedSession = cache(async () =>
  requirePageSession({ next: await currentPath(), privileged: true }),
);
