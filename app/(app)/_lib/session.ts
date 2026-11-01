import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { requirePageSession } from '@/server/auth/page-guard';

/**
 * Every (app) layout and page starts here: T4's guard (sign-in, expiry, deactivation, MFA for pure
 * Admin/Finance) once per request; `x-pathname` from middleware restores the page after sign-in.
 */
export const requireSession = cache(async () =>
  requirePageSession({
    next: (await headers()).get('x-pathname') ?? undefined,
  }),
);
