import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { refreshSessionCookies } from './server/auth/refresh';
import { problemResponse } from './server/http/problem';
import {
  contentSecurityPolicy,
  isTrustedMutation,
} from './server/security/http';

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // Always overwritten so a client-sent value never reaches the post-sign-in redirect.
  requestHeaders.set(
    'x-pathname',
    request.nextUrl.pathname + request.nextUrl.search,
  );

  const path = request.nextUrl.pathname;
  const api = path === '/api/v1' || path.startsWith('/api/v1/');
  if (api && !isTrustedMutation(request, process.env.APP_URL!)) {
    const response = problemResponse(403, 'CSRF_FORBIDDEN', crypto.randomUUID());
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  // Only keeps the Supabase session cookie fresh; every authorization check happens server-side (ADR-002 §10a).
  const refreshed =
    request.headers.has('authorization') || !process.env.SUPABASE_URL
      ? null
      : await refreshSessionCookies(request.headers.get('cookie') ?? '', {
          supabaseUrl: process.env.SUPABASE_URL,
          publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
          secure: process.env.APP_URL?.startsWith('https:') ?? true,
        }).catch(() => null);
  if (refreshed) requestHeaders.set('cookie', refreshed.requestCookie);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of refreshed?.setCookies ?? [])
    response.headers.append('Set-Cookie', cookie);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
