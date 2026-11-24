import {
  combineChunks,
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  stringFromBase64URL,
  type CookieOptions,
} from '@supabase/ssr';
import { decodeJwt } from 'jose/jwt/decode';

const REFRESH_MARGIN_SECONDS = 60;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface RefreshResult {
  /** Cookie header to forward to the page/route so it reads the fresh token in the same request. */
  readonly requestCookie: string;
  readonly setCookies: readonly string[];
}

function storageKey(supabaseUrl: string) {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

function expiresAt(serialized: string | null): number | null {
  if (!serialized) return null;
  try {
    const json = serialized.startsWith('base64-')
      ? stringFromBase64URL(serialized.slice('base64-'.length))
      : serialized;
    const value: unknown = JSON.parse(json);
    const at =
      value && typeof value === 'object'
        ? Reflect.get(value, 'expires_at')
        : null;
    return typeof at === 'number' ? at : null;
  } catch {
    return null;
  }
}

/** Remaining absolute lifetime from the earliest `amr` timestamp (the sign-in itself), for cookie Max-Age (T4-B09). */
function remainingLifetime(accessToken: string | undefined, now: number) {
  if (!accessToken) return SESSION_MAX_AGE;
  try {
    const amr = decodeJwt(accessToken).amr;
    const stamps = Array.isArray(amr)
      ? amr.flatMap((entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof Reflect.get(entry, 'timestamp') === 'number'
            ? [Reflect.get(entry, 'timestamp') as number]
            : [],
        )
      : [];
    if (stamps.length === 0) return SESSION_MAX_AGE;
    return Math.max(
      0,
      Math.min(SESSION_MAX_AGE, Math.min(...stamps) + SESSION_MAX_AGE - now),
    );
  } catch {
    return SESSION_MAX_AGE;
  }
}

/**
 * Middleware-only token refresh (ADR-002 §10a: middleware is not authorization). Runs Supabase only
 * when the access token is within a minute of expiry, so ordinary requests make no Auth call.
 */
export async function refreshSessionCookies(
  cookieHeader: string,
  env: { supabaseUrl: string; publishableKey: string; secure: boolean },
  now = Math.floor(Date.now() / 1000),
): Promise<RefreshResult | null> {
  if (!cookieHeader || cookieHeader.length > 65_536) return null;
  const key = storageKey(env.supabaseUrl);
  const cookies = parseCookieHeader(cookieHeader);
  const jar = new Map(cookies.map(({ name, value }) => [name, value]));
  if (
    ![...jar.keys()].some((name) => name === key || name.startsWith(`${key}.`))
  )
    return null;
  const expiry = expiresAt(await combineChunks(key, (name) => jar.get(name)));
  if (expiry !== null && expiry - now > REFRESH_MARGIN_SECONDS) return null;

  const writes: { name: string; value: string; options: CookieOptions }[] = [];
  const client = createServerClient(env.supabaseUrl, env.publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const value of values) {
          writes.push(value);
          if (value.options.maxAge === 0) jar.delete(value.name);
          else jar.set(value.name, value.value);
        }
      },
    },
    auth: { flowType: 'pkce', detectSessionInUrl: false },
  });
  const { data } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (writes.length === 0) return null;
  const maxAge = remainingLifetime(accessToken, now);
  return {
    requestCookie: [...jar]
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
    setCookies: writes.map(({ name, value, options }) =>
      serializeCookieHeader(name, value, {
        path: '/',
        sameSite: 'lax',
        secure: env.secure,
        httpOnly: true,
        maxAge: options.maxAge === 0 ? 0 : maxAge,
      }),
    ),
  };
}
