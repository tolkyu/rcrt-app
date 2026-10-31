import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  contentSecurityPolicy,
  isTrustedMutation,
} from './server/security/http';

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response: NextResponse;
  const path = request.nextUrl.pathname;
  if (
    (path === '/api/v1' || path.startsWith('/api/v1/')) &&
    !isTrustedMutation(request, process.env.APP_URL!)
  ) {
    response = NextResponse.json(
      { error: { code: 'CSRF_FORBIDDEN' } },
      { status: 403 },
    );
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
