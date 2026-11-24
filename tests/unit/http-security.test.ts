import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  isTrustedMutation,
} from '@/server/security/http';

const appUrl = 'https://recruiting.example.com';
function mutation(headers: Record<string, string> = {}, method = 'POST') {
  return new Request(`${appUrl}/api/v1/verticals`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('REST mutation CSRF guard', () => {
  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    '',
  ])('rejects non-JSON content type %s even with a matching origin', (type) => {
    expect(
      isTrustedMutation(
        mutation({
          origin: appUrl,
          'x-csrf-protection': '1',
          'content-type': type,
        }),
        appUrl,
      ),
    ).toBe(false);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'allows %s with matching origin and preflight header',
    (method) => {
      expect(
        isTrustedMutation(
          mutation({ origin: appUrl, 'x-csrf-protection': '1' }, method),
          appUrl,
        ),
      ).toBe(true);
    },
  );
  it.each<Record<string, string>>([
    {},
    { origin: appUrl },
    { 'x-csrf-protection': '1' },
    { origin: 'null', 'x-csrf-protection': '1' },
    { origin: `${appUrl}.evil.test`, 'x-csrf-protection': '1' },
    {
      origin: appUrl,
      'x-csrf-protection': '1',
      'sec-fetch-site': 'cross-site',
    },
    {
      origin: 'https://evil.test',
      host: 'recruiting.example.com',
      'x-forwarded-host': 'recruiting.example.com',
      'x-csrf-protection': '1',
    },
  ])('rejects missing or forged browser protection %j', (headers) => {
    expect(isTrustedMutation(mutation(headers), appUrl)).toBe(false);
  });
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'allows safe %s without mutation headers',
    (method) => {
      expect(isTrustedMutation(mutation({}, method), appUrl)).toBe(true);
    },
  );
});

describe('CSP', () => {
  it('requires a nonce for scripts and denies embedding and plugins in production', () => {
    const csp = contentSecurityPolicy('test-nonce', false);
    expect(csp).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic';",
    );
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it('permits eval only during local Next development', () => {
    expect(contentSecurityPolicy('test-nonce', true)).toContain('unsafe-eval');
  });
});
