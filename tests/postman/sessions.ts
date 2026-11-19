import { combineChunks, stringFromBase64URL } from '@supabase/ssr';
import { demoTotpCode, magicLinkTokenHash } from '../support/demo-auth';

const STORAGE_KEY = /^sb-[A-Za-z0-9_-]+-auth-token$/;

export interface ApiSession {
  /** Access token before the TOTP step (aal1); equals `token` for users without TOTP. */
  readonly aal1Token: string;
  readonly token: string;
  /** Cookie header of the session, for routes bound to the cookie session (logout). */
  readonly cookie: string;
  /** Logs out; resolves `true` only if every token of the session is rejected afterwards. */
  readonly close: () => Promise<boolean>;
}

function storeCookies(jar: Map<string, string>, response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair = '', ...attributes] = line.split(';');
    const split = pair.indexOf('=');
    const name = pair.slice(0, split).trim();
    const value = decodeURIComponent(pair.slice(split + 1).trim());
    const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
    if (!value || expired) jar.delete(name);
    else jar.set(name, value);
  }
}

const cookieHeader = (jar: Map<string, string>) =>
  [...jar]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');

async function accessToken(jar: Map<string, string>): Promise<string> {
  const key = [...jar.keys()]
    .map((name) => name.replace(/\.\d+$/, ''))
    .find((name) => STORAGE_KEY.test(name));
  const combined = key && (await combineChunks(key, (name) => jar.get(name)));
  if (!combined) throw new Error('Sign-in set no Supabase session cookie');
  const json = combined.startsWith('base64-')
    ? stringFromBase64URL(combined.slice('base64-'.length))
    : combined;
  let session: unknown;
  try {
    session = JSON.parse(json);
  } catch {
    throw new Error('Session cookie is not valid JSON');
  }
  const token: unknown =
    session && typeof session === 'object'
      ? Reflect.get(session, 'access_token')
      : undefined;
  if (typeof token !== 'string')
    throw new Error('Session cookie has no access token');
  return token;
}

/**
 * Signs in through the app's own confirm (and TOTP verify) endpoints so the app session row exists
 * and aal2 is app-verified; the access token from the session cookie is then used as a Bearer token.
 */
export async function signInForApi(
  origin: string,
  email: string,
  totp: boolean,
): Promise<ApiSession> {
  const jar = new Map<string, string>();
  const call = async (method: 'GET' | 'POST', path: string, body?: object) => {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        cookie: cookieHeader(jar),
        ...(body && {
          origin,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
        }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`${method} ${path} for ${email} → ${response.status}`);
    storeCookies(jar, response);
    return response.json() as Promise<unknown>;
  };

  await call('POST', '/auth/confirm', {
    token_hash: await magicLinkTokenHash(email),
  });
  const aal1Token = await accessToken(jar);
  if (totp) {
    const { factors } = (await call('GET', '/auth/mfa')) as {
      factors: { id: string }[];
    };
    const factorId = factors[0]?.id;
    if (!factorId) throw new Error(`${email} has no seeded TOTP factor`);
    await call('POST', '/auth/mfa/verify', { factorId, code: demoTotpCode() });
  }
  const token = totp ? await accessToken(jar) : aal1Token;
  return {
    aal1Token,
    token,
    cookie: cookieHeader(jar),
    close: async () => {
      await call('POST', '/auth/logout', {});
      const statuses = await Promise.all(
        [...new Set([aal1Token, token])].map(async (bearer) => {
          const response = await fetch(`${origin}/api/v1/me`, {
            headers: { authorization: `Bearer ${bearer}` },
            signal: AbortSignal.timeout(15_000),
          });
          return response.status;
        }),
      );
      return statuses.every((status) => status === 401);
    },
  };
}
