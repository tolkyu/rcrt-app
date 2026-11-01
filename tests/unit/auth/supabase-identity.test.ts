import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { createSupabaseIdentityVerifier } from '../../../server/auth/supabase-identity';
import {
  bearer,
  identityFixture,
  identityToken,
  sessionCookie,
  signingKey,
  startJwksFixture,
} from './jwks-fixture';

let fixture: Awaited<ReturnType<typeof startJwksFixture>>;
beforeAll(async () => {
  fixture = await startJwksFixture();
});
beforeEach(() => {
  fixture.publish([fixture.es.publicJwk, fixture.rs.publicJwk]);
  fixture.respond('normal');
});
afterAll(async () => {
  await fixture.stop();
});

function verifier() {
  return createSupabaseIdentityVerifier({
    supabaseUrl: fixture.origin,
    jwks: { cooldownDuration: 0 },
  });
}

describe('Supabase credential verification with real signatures and HTTP JWKS [DG-02]', () => {
  it.each([
    ['a service-role token', { role: 'service_role' }],
    ['an anon-role token', { role: 'anon' }],
    ['an anonymous user', { is_anonymous: true }],
    ['a token without role', { role: undefined }],
  ])('rejects %s [SEC-T4-07]', async (_case, claims) => {
    const token = await identityToken(fixture, claims);
    expect(await verifier()(bearer(token))).toBeNull();
  });

  it.each(['ES256', 'RS256'] as const)(
    'verifies %s and emits only the validated identity',
    async (algorithm) => {
      const token = await identityToken(
        fixture,
        {
          user_metadata: { role: 'ADMIN', verticalIds: ['all'] },
          app_metadata: { roles: ['ADMIN'] },
        },
        algorithm === 'ES256' ? fixture.es : fixture.rs,
      );
      expect(await verifier()(bearer(token))).toEqual(identityFixture);
    },
  );

  it('rejects a validly structured token signed by an untrusted key', async () => {
    const foreign = await signingKey('ES256', fixture.es.kid);
    expect(
      await verifier()(bearer(await identityToken(fixture, {}, foreign))),
    ).toBeNull();
  });

  it('rejects HMAC algorithm confusion and unsigned tokens', async () => {
    const token = await new SignJWT({ sub: identityFixture.authUserId })
      .setProtectedHeader({ alg: 'HS256', kid: fixture.es.kid })
      .sign(
        new TextEncoder().encode('a-local-test-secret-with-sufficient-length'),
      );
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`;
    expect(await verifier()(bearer(token))).toBeNull();
    expect(await verifier()(bearer(unsigned))).toBeNull();
  });

  it.each([
    ['issuer', { iss: 'https://untrusted.invalid/auth/v1' }],
    ['audience', { aud: 'service_role' }],
    ['missing audience', { aud: undefined }],
    ['expired token', { exp: 1 }],
    ['missing expiry', { exp: undefined }],
    ['future not-before', { nbf: Math.floor(Date.now() / 1000) + 600 }],
    ['malformed subject', { sub: 'not-a-uuid' }],
    ['missing subject', { sub: undefined }],
    ['missing session', { session_id: undefined }],
    ['malformed session', { session_id: 'not-a-uuid' }],
    ['missing assurance', { aal: undefined }],
    ['unknown assurance', { aal: 'aal3' }],
  ] as const)('rejects %s despite a valid signature', async (_case, claims) => {
    expect(
      await verifier()(bearer(await identityToken(fixture, claims))),
    ).toBeNull();
  });

  it('requires kid and rejects a key that the JWKS does not publish', async () => {
    expect(
      await verifier()(
        bearer(
          await identityToken(fixture, {}, fixture.es, { kid: undefined }),
        ),
      ),
    ).toBeNull();
    expect(
      await verifier()(
        bearer(
          await identityToken(fixture, {}, fixture.es, { kid: 'unpublished' }),
        ),
      ),
    ).toBeNull();
  });

  it('accepts aal2 only after verifying its signature', async () => {
    expect(
      await verifier()(bearer(await identityToken(fixture, { aal: 'aal2' }))),
    ).toEqual({ ...identityFixture, aal: 'aal2' });
  });

  it.each(['jku', 'jwk', 'x5u'] as const)(
    'rejects a token-provided %s before any key request',
    async (field) => {
      const header =
        field === 'jwk'
          ? { jwk: fixture.es.publicJwk }
          : field === 'jku'
            ? { jku: 'http://127.0.0.1:1/untrusted-jwks' }
            : { x5u: 'http://127.0.0.1:1/untrusted-certificate' };
      const token = await identityToken(fixture, {}, fixture.es, header);
      const before = fixture.requests;
      expect(await verifier()(bearer(token))).toBeNull();
      expect(fixture.requests).toBe(before);
    },
  );

  it('rejects malformed signature lengths before requesting keys', async () => {
    const token = await identityToken(fixture);
    const unsignedParts = token.split('.').slice(0, 2).join('.');
    const before = fixture.requests;
    expect(await verifier()(bearer(`${unsignedParts}.A`))).toBeNull();
    expect(await verifier()(bearer(`${unsignedParts}.AA`))).toBeNull();
    expect(fixture.requests).toBe(before);
  });

  it('caches the JWKS across requests rather than fetching on every verification', async () => {
    const verify = verifier();
    const token = await identityToken(fixture);
    const before = fixture.requests;
    expect(await verify(bearer(token))).toEqual(identityFixture);
    expect(await verify(bearer(token))).toEqual(identityFixture);
    expect(fixture.requests - before).toBe(1);
  });

  it('refreshes JWKS for a newly rotated kid and rejects a removed key', async () => {
    const verify = verifier();
    const oldToken = await identityToken(fixture);
    const before = fixture.requests;
    expect(await verify(bearer(oldToken))).toEqual(identityFixture);
    const rotated = await signingKey('ES256', 'qa-rotated');
    fixture.publish([rotated.publicJwk]);
    expect(
      await verify(bearer(await identityToken(fixture, {}, rotated))),
    ).toEqual(identityFixture);
    expect(fixture.requests - before).toBe(2);
    expect(await verify(bearer(oldToken))).toBeNull();
  });

  it.each(['unavailable', 'invalid-json'] as const)(
    'fails closed when the configured JWKS response is %s',
    async (mode) => {
      fixture.respond(mode);
      const before = fixture.requests;
      expect(await verifier()(bearer(await identityToken(fixture)))).toBeNull();
      expect(fixture.requests - before).toBe(1);
    },
  );

  it('bounds a hanging JWKS request by the configured timeout', async () => {
    fixture.respond('hang');
    const verify = createSupabaseIdentityVerifier({
      supabaseUrl: fixture.origin,
      jwks: { timeoutDuration: 25 },
    });
    const before = fixture.requests;
    expect(await verify(bearer(await identityToken(fixture)))).toBeNull();
    expect(fixture.requests - before).toBe(1);
  }, 2_000);
});

describe('Credential extraction fails closed [DG-02, T-A10]', () => {
  it.each([true, false])(
    'verifies the standard Supabase session cookie (base64=%s)',
    async (encoded) => {
      const token = await identityToken(fixture);
      expect(
        await verifier()(
          new Headers({ cookie: sessionCookie(token, encoded) }),
        ),
      ).toEqual(identityFixture);
    },
  );

  it('combines consecutive cookie chunks before parsing the session', async () => {
    const value = sessionCookie(await identityToken(fixture)).split('=')[1]!;
    const middle = Math.floor(value.length / 2);
    const cookie = `unrelated=ok; sb-127-auth-token.1=${value.slice(middle)}; sb-127-auth-token.0=${value.slice(0, middle)}`;
    expect(await verifier()(new Headers({ cookie }))).toEqual(identityFixture);
  });

  it.each([
    '',
    'Basic invalid',
    'Bearer',
    'Bearer malformed',
    'Bearer one two',
  ])(
    'does not fall back to a valid cookie when Authorization is present: %s',
    async (authorization) => {
      expect(
        await verifier()(
          new Headers({
            authorization,
            cookie: sessionCookie(await identityToken(fixture)),
          }),
        ),
      ).toBeNull();
    },
  );

  it('prioritizes a valid Bearer identity over a different cookie identity', async () => {
    const differentId = '20000000-0000-4000-8000-000000000003';
    const authorization = `Bearer ${await identityToken(fixture, { sub: differentId })}`;
    expect(
      await verifier()(
        new Headers({
          authorization,
          cookie: sessionCookie(await identityToken(fixture)),
        }),
      ),
    ).toEqual({ ...identityFixture, authUserId: differentId });
  });

  it('does not fall back to a valid cookie when a signed Bearer token has expired', async () => {
    const headers = bearer(await identityToken(fixture, { exp: 1 }));
    headers.set('cookie', sessionCookie(await identityToken(fixture)));
    expect(await verifier()(headers)).toBeNull();
  });

  it.each([
    'sb-127-auth-token=base64-%%%bad',
    'sb-127-auth-token=%ZZ',
    'sb-127-auth-token=%7Bnot-json',
    'sb-127-auth-token=base64-bnVsbA',
    'sb-127-auth-token=base64-e30',
    'sb-other-auth-token=ignored',
    'sb-127-auth-token.1=gap',
    'sb-127-auth-token.0=first; sb-127-auth-token.2=gap',
    'sb-127-auth-token.0=first; sb-127-auth-token.0=duplicate',
    'sb-127-auth-token=first; sb-127-auth-token=duplicate',
    'sb-127-auth-token=standalone; sb-127-auth-token.0=chunk',
  ])(
    'rejects malformed or ambiguous cookie credentials: %s',
    async (cookie) => {
      expect(await verifier()(new Headers({ cookie }))).toBeNull();
    },
  );

  it('rejects oversized tokens, cookie headers and excessive chunk counts before fetching JWKS', async () => {
    const before = fixture.requests;
    const verify = verifier();
    expect(await verify(bearer('a'.repeat(16_385)))).toBeNull();
    expect(
      await verify(new Headers({ cookie: `unrelated=${'a'.repeat(65_536)}` })),
    ).toBeNull();
    const cookie = Array.from(
      { length: 33 },
      (_, index) => `sb-127-auth-token.${index}=a`,
    ).join('; ');
    expect(await verify(new Headers({ cookie }))).toBeNull();
    expect(fixture.requests).toBe(before);
  });

  it('returns null without credentials and ignores auth tokens belonging to another Supabase project', async () => {
    expect(await verifier()(new Headers())).toBeNull();
    expect(
      await verifier()(
        new Headers({
          cookie: sessionCookie(await identityToken(fixture)).replace(
            'sb-127-',
            'sb-other-',
          ),
        }),
      ),
    ).toBeNull();
  });
});
