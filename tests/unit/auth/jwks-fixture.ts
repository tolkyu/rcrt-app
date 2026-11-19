import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWK, JWTPayload } from 'jose';

export const identityFixture = {
  authUserId: '20000000-0000-4000-8000-000000000001',
  sessionId: '20000000-0000-4000-8000-000000000002',
  aal: 'aal1' as const,
};

export async function signingKey(algorithm: 'ES256' | 'RS256', kid: string) {
  const { privateKey, publicKey } = await generateKeyPair(algorithm, {
    extractable: true,
  });
  return {
    algorithm,
    kid,
    privateKey,
    publicJwk: {
      ...(await exportJWK(publicKey)),
      alg: algorithm,
      kid,
      use: 'sig',
    },
  };
}

export async function startJwksFixture() {
  const es = await signingKey('ES256', 'qa-es256');
  const rs = await signingKey('RS256', 'qa-rs256');
  let published: JWK[] = [es.publicJwk, rs.publicJwk];
  let requests = 0;
  let responseMode: 'normal' | 'unavailable' | 'invalid-json' | 'hang' =
    'normal';
  const server = createServer((request, response) => {
    if (request.url !== '/auth/v1/.well-known/jwks.json') {
      response.writeHead(404).end();
      return;
    }
    requests += 1;
    if (responseMode === 'hang') return;
    if (responseMode === 'unavailable') {
      response.writeHead(503).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      responseMode === 'invalid-json'
        ? '{invalid-json'
        : JSON.stringify({ keys: published }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected loopback JWKS HTTP server');
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    es,
    rs,
    get requests() {
      return requests;
    },
    publish(keys: JWK[]) {
      published = keys;
    },
    respond(mode: typeof responseMode) {
      responseMode = mode;
    },
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function identityToken(
  fixture: Awaited<ReturnType<typeof startJwksFixture>>,
  claims: JWTPayload = {},
  key = fixture.es,
  header: {
    kid?: string;
    alg?: string;
    jku?: string;
    jwk?: JWK;
    x5u?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: `${fixture.origin}/auth/v1`,
    aud: 'authenticated',
    sub: identityFixture.authUserId,
    session_id: identityFixture.sessionId,
    aal: identityFixture.aal,
    role: 'authenticated',
    iat: now,
    exp: now + 600,
    ...claims,
  })
    .setProtectedHeader({ alg: key.algorithm, kid: key.kid, ...header })
    .sign(key.privateKey);
}

export function bearer(token: string) {
  return new Headers({ authorization: `Bearer ${token}` });
}

export function sessionCookie(token: string, encoded = true) {
  const json = JSON.stringify({
    access_token: token,
    refresh_token: 'test-only',
  });
  const value = encoded
    ? `base64-${Buffer.from(json).toString('base64url')}`
    : json;
  return `sb-127-auth-token=${encodeURIComponent(value)}`;
}
