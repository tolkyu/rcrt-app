import { describe, expect, it, vi } from 'vitest';
import {
  createAuthCookieStore,
  type AuthCookieStore,
} from '../../../server/auth/cookies';
import type { SystemContext } from '../../../server/context/request-context';
import type { DbExecutor } from '../../../server/db';
import { fixedClock } from '../../../server/domain/clock';
import { RateLimitedError } from '../../../server/http/errors';
import { createApiRegistry } from '../../../server/http/openapi';
import { createPublicAuthRouteFactory } from '../../../server/http/public-route';
import {
  magicLinkRequestSchema,
  magicLinkResponseSchema,
} from '../../../lib/schemas/auth';

const appUrl = 'https://hiring.fixture.test';
const body = JSON.stringify({ email: ' PERSON@FIXTURE.TEST ' });
const trusted = {
  origin: appUrl,
  'content-type': 'application/json',
  'x-csrf-protection': '1',
};

type Handler = (
  ctx: SystemContext,
  body: { email: string },
  cookies: AuthCookieStore,
) => Promise<{ accepted: true }>;

function publicRoute(handler: Handler) {
  const db = vi.fn(() => ({}) as DbExecutor);
  const route = createPublicAuthRouteFactory({
    db,
    clock: fixedClock(new Date('2026-11-16T08:00:00Z')),
    appUrl: () => appUrl,
    registry: createApiRegistry(),
  })(
    {
      path: '/auth/magic-link',
      operationId: 'testMagicLink',
      summary: 'Magic link',
      tags: ['Auth'],
      body: magicLinkRequestSchema,
      response: magicLinkResponseSchema,
      errors: [429],
    },
    handler,
  );
  return { route, db };
}

const params = { params: Promise.resolve({}) };

describe('Public magic-link transport [STORY-SEC-AUTH-1, SEC, ADR-006]', () => {
  it('accepts unauthenticated requests, normalizes the email and emits only the response DTO', async () => {
    const handler = vi.fn<Handler>(async () => ({ accepted: true as const }));
    const { route } = publicRoute(handler);
    const response = await route(
      new Request(`${appUrl}/api/v1/auth/magic-link`, {
        method: 'POST',
        headers: trusted,
        body,
      }),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(handler.mock.calls[0]?.[1]).toEqual({
      email: 'person@fixture.test',
    });
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ auth: null });
  });

  it.each([
    { ...trusted, origin: 'https://attacker.invalid' },
    { ...trusted, 'x-csrf-protection': '' },
    { ...trusted, 'content-type': 'text/plain' },
    { ...trusted, 'sec-fetch-site': 'cross-site' },
  ])(
    'rejects untrusted POSTs before loading the database or invoking the handler',
    async (headers) => {
      const handler = vi.fn(async () => ({ accepted: true as const }));
      const { route, db } = publicRoute(handler);
      const response = await route(
        new Request(`${appUrl}/api/v1/auth/magic-link`, {
          method: 'POST',
          headers,
          body,
        }),
        params,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'CSRF_FORBIDDEN' });
      expect(db).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    '{bad-json',
    JSON.stringify({ email: 'invalid' }),
    JSON.stringify({
      email: 'person@fixture.test',
      redirectTo: 'https://attacker.invalid',
    }),
  ])(
    'rejects malformed or extra input fields without calling the handler',
    async (input) => {
      const handler = vi.fn(async () => ({ accepted: true as const }));
      const { route } = publicRoute(handler);
      const response = await route(
        new Request(`${appUrl}/api/v1/auth/magic-link`, {
          method: 'POST',
          headers: trusted,
          body: input,
        }),
        params,
      );
      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('maps actual rate-limit errors to 429 with Retry-After', async () => {
    const { route } = publicRoute(async () => {
      throw new RateLimitedError(73);
    });
    const response = await route(
      new Request(`${appUrl}/api/v1/auth/magic-link`, {
        method: 'POST',
        headers: trusted,
        body,
      }),
      params,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('73');
    expect(await response.json()).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('does not return provider secrets or unapproved output fields', async () => {
    const secret = 'synthetic-provider-token-never-return';
    const { route } = publicRoute(async () => ({
      accepted: true,
      access_token: secret,
    }));
    const response = await route(
      new Request(`${appUrl}/api/v1/auth/magic-link`, {
        method: 'POST',
        headers: trusted,
        body,
      }),
      params,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
  });
});

describe('Magic-link cookie staging [SEC, DG-02]', () => {
  it('holds SDK cookies until commit and enforces the approved cookie attributes', () => {
    const cookies = createAuthCookieStore(new Headers(), appUrl);
    cookies.setAll([
      {
        name: 'sb-fixture-auth-token',
        value: 'synthetic-session',
        options: { path: '/wrong', sameSite: 'none', secure: false },
      },
    ]);
    const before = new Response();
    cookies.apply(before);
    expect(before.headers.getSetCookie()).toHaveLength(0);
    cookies.commit();
    const response = new Response();
    cookies.apply(response);
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).toContain('HttpOnly');
  });

  it('discards an unverified staged session and clears existing auth chunks without clearing preferences', () => {
    const cookies = createAuthCookieStore(
      new Headers({
        cookie:
          'theme=dark; sb-fixture-auth-token.0=old; sb-fixture-auth-token.1=old',
      }),
      appUrl,
    );
    cookies.setAll([
      {
        name: 'sb-fixture-auth-token',
        value: 'unverified-session',
        options: {},
      },
    ]);
    cookies.discard();
    const discarded = new Response();
    cookies.apply(discarded);
    expect(discarded.headers.getSetCookie()).toHaveLength(0);
    cookies.clear();
    const response = new Response();
    cookies.apply(response);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(
      response.headers
        .getSetCookie()
        .every(
          (cookie) =>
            cookie.includes('Max-Age=0') && !cookie.includes('theme='),
        ),
    ).toBe(true);
  });
});
