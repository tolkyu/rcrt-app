const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Compare against configured origin; Host and forwarded headers are attacker-controlled. */
export function isTrustedMutation(request: Request, appUrl: string) {
  if (safeMethods.has(request.method.toUpperCase())) return true;
  return (
    request.headers.get('origin') === new URL(appUrl).origin &&
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ===
      'application/json' &&
    request.headers.get('x-csrf-protection') === '1' &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  );
}

export function contentSecurityPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
