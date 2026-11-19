import 'server-only';

import {
  combineChunks,
  isChunkLike,
  parseCookieHeader,
  stringFromBase64URL,
} from '@supabase/ssr';
import {
  base64url,
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose';
import type { JWTPayload } from 'jose';
import {
  verifiedIdentitySchema,
  type IdentityVerifier,
} from '@/server/context/identity';

const MAX_TOKEN_LENGTH = 16_384;
const MAX_COOKIE_LENGTH = 65_536;
const MAX_COOKIE_CHUNKS = 32;
const CLOCK_TOLERANCE_SECONDS = 30;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface SupabaseIdentityVerifierConfig {
  supabaseUrl: string;
  jwks?: {
    timeoutDuration?: number;
    cooldownDuration?: number;
    cacheMaxAge?: number;
  };
}

function boundedOption(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error('Invalid Supabase JWKS configuration');
  }
  return resolved;
}

function authConfiguration(config: SupabaseIdentityVerifierConfig) {
  let url: URL;
  try {
    url = new URL(config.supabaseUrl);
  } catch {
    throw new Error('Invalid Supabase URL configuration');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Invalid Supabase URL configuration');
  }

  // Match the installed Supabase SDK's default storage key, not a request-supplied cookie name.
  const storageKey = `sb-${url.hostname.split('.')[0]}-auth-token`;
  if (!/^sb-[A-Za-z0-9_-]+-auth-token$/.test(storageKey)) {
    throw new Error('Invalid Supabase auth storage key');
  }

  return {
    issuer: `${url.origin}/auth/v1`,
    storageKey,
    jwksUrl: new URL('/auth/v1/.well-known/jwks.json', url),
  };
}

async function cookieAccessToken(
  header: string | null,
  storageKey: string,
): Promise<string | null> {
  if (!header || header.length > MAX_COOKIE_LENGTH) return null;

  const cookies = new Map<string, string>();
  for (const entry of header.split(';')) {
    for (const { name, value } of parseCookieHeader(entry)) {
      if (name !== storageKey && !name.startsWith(`${storageKey}.`)) continue;
      if (!isChunkLike(name, storageKey) || cookies.has(name) || !value) {
        return null;
      }
      cookies.set(name, value);
    }
  }
  if (cookies.size === 0 || cookies.size > MAX_COOKIE_CHUNKS) return null;
  if (cookies.has(storageKey)) {
    if (cookies.size !== 1) return null;
  } else {
    for (let index = 0; index < cookies.size; index += 1) {
      if (!cookies.has(`${storageKey}.${index}`)) return null;
    }
  }

  const combined = await combineChunks(storageKey, (name) => cookies.get(name));
  if (!combined || combined.length > MAX_COOKIE_LENGTH) return null;

  let serialized = combined;
  if (combined.startsWith('base64-')) {
    const encoded = combined.slice('base64-'.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
      return null;
    }
    serialized = stringFromBase64URL(encoded);
  }
  const session: unknown = JSON.parse(serialized);
  if (
    typeof session !== 'object' ||
    session === null ||
    Array.isArray(session)
  ) {
    return null;
  }
  const accessToken = Reflect.get(session, 'access_token');
  return typeof accessToken === 'string' ? accessToken : null;
}

function identityClaims(payload: JWTPayload) {
  // Only signed-in users: anonymous and service tokens never become an identity (SEC-T4-07).
  if (payload.role !== 'authenticated' || payload.is_anonymous === true)
    return verifiedIdentitySchema.safeParse(null);
  return verifiedIdentitySchema.safeParse({
    authUserId: payload.sub,
    sessionId: payload.session_id,
    aal: payload.aal,
  });
}

function validEnvelope(token: string, issuer: string): boolean {
  if (token.length > MAX_TOKEN_LENGTH || !JWT_PATTERN.test(token)) return false;
  const header = decodeProtectedHeader(token);
  if (
    (header.alg !== 'ES256' && header.alg !== 'RS256') ||
    typeof header.kid !== 'string' ||
    !/^[\x21-\x7e]{1,256}$/.test(header.kid) ||
    header.jku !== undefined ||
    header.jwk !== undefined ||
    header.x5u !== undefined ||
    header.crit !== undefined ||
    header.b64 !== undefined
  ) {
    return false;
  }
  const signature = token.split('.')[2];
  if (!signature || signature.length % 4 === 1) return false;
  const signatureLength = base64url.decode(signature).byteLength;
  if (
    (header.alg === 'ES256' && signatureLength !== 64) ||
    (header.alg === 'RS256' && signatureLength < 256)
  ) {
    return false;
  }
  const payload = decodeJwt(token);
  const now = Date.now() / 1000;
  return (
    payload.iss === issuer &&
    (payload.aud === 'authenticated' ||
      (Array.isArray(payload.aud) &&
        payload.aud.every((audience) => typeof audience === 'string') &&
        payload.aud.includes('authenticated'))) &&
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp) &&
    payload.exp > now - CLOCK_TOLERANCE_SECONDS &&
    (payload.iat === undefined ||
      (typeof payload.iat === 'number' && Number.isFinite(payload.iat))) &&
    (payload.nbf === undefined ||
      (typeof payload.nbf === 'number' &&
        Number.isFinite(payload.nbf) &&
        payload.nbf <= now + CLOCK_TOLERANCE_SECONDS)) &&
    identityClaims(payload).success
  );
}

/** Only trusted server configuration selects the issuer and cached JWKS endpoint. */
export function createSupabaseIdentityVerifier(
  config: SupabaseIdentityVerifierConfig,
): IdentityVerifier {
  const { issuer, storageKey, jwksUrl } = authConfiguration(config);
  const jwks = createRemoteJWKSet(jwksUrl, {
    timeoutDuration: boundedOption(
      config.jwks?.timeoutDuration,
      5_000,
      1,
      30_000,
    ),
    cooldownDuration: boundedOption(
      config.jwks?.cooldownDuration,
      30_000,
      0,
      600_000,
    ),
    cacheMaxAge: boundedOption(config.jwks?.cacheMaxAge, 600_000, 1, 3_600_000),
  });

  return async (headers) => {
    try {
      const authorization = headers.get('authorization');
      let token: string | null;
      if (authorization !== null) {
        if (authorization.length > MAX_TOKEN_LENGTH + 7) return null;
        const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(authorization);
        token = bearer?.[1] ?? null;
      } else {
        token = await cookieAccessToken(headers.get('cookie'), storageKey);
      }
      if (!token || !validEnvelope(token, issuer)) return null;

      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['ES256', 'RS256'],
        issuer,
        audience: 'authenticated',
        requiredClaims: ['exp', 'sub', 'session_id', 'aal'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      const identity = identityClaims(payload);
      return identity.success ? identity.data : null;
    } catch {
      return null;
    }
  };
}

let productionVerifier: IdentityVerifier | undefined;

export const verifySupabaseIdentity: IdentityVerifier = async (headers) => {
  try {
    productionVerifier ??= createSupabaseIdentityVerifier({
      supabaseUrl: process.env.SUPABASE_URL ?? '',
    });
    return await productionVerifier(headers);
  } catch {
    return null;
  }
};
