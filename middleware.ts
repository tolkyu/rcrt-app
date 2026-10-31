import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { problemResponse } from './server/http/problem';
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

  let response: Response;
  const path = request.nextUrl.pathname;
  if (
    (path === '/api/v1' || path.startsWith('/api/v1/')) &&
    !isTrustedMutation(request, process.env.APP_URL!)
  ) {
    response = problemResponse(403, 'CSRF_FORBIDDEN', crypto.randomUUID());
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
