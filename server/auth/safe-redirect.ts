const AUTH_PATHS =
  /^\/(api|auth|login|invite|mfa|session-expired|dev-login)(\/|$)/;

/** Only same-origin relative paths outside the auth screens survive a sign-in redirect (DG-15, P1-17). */
export function safeNextPath(
  value: string | null | undefined,
  fallback = '/',
): string {
  if (!value || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return fallback;
  if (/\p{Cc}/u.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, 'http://app.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'http://app.invalid' || AUTH_PATHS.test(url.pathname))
    return fallback;
  return `${url.pathname}${url.search}`;
}
