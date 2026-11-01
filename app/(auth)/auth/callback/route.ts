import { NextResponse } from 'next/server';
import { createAuthCookieStore } from '@/server/auth/cookies';
import { requestMeta } from '@/server/context/request-context';
import { authDependencies } from '@/server/services/auth/app';
import { completeGoogleCallback } from '@/server/services/auth/google';
import { publicAuthContext } from '@/server/services/auth/public-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Google OAuth return: a GET by protocol; the one-time code is exchanged server-side (PKCE, T4-D01). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = authDependencies.appUrl();
  const cookies = createAuthCookieStore(request.headers, appUrl);
  const path = await completeGoogleCallback(
    authDependencies,
    publicAuthContext(requestMeta(request.headers)),
    {
      code: url.searchParams.get('code'),
      error: url.searchParams.get('error'),
    },
    cookies,
  );
  const response = NextResponse.redirect(new URL(path, appUrl), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  cookies.apply(response);
  return response;
}
