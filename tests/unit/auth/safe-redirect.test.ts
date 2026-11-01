import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../../../server/auth/safe-redirect';

describe('Post-sign-in redirect allowlist [T4-C09, DG-15, SEC-AUTH-R01]', () => {
  it.each([
    '//evil.tld',
    '/\\evil.tld',
    'https://evil.tld',
    'javascript:alert(1)',
    'evil.tld/path',
    '/a/..//evil.tld',
    '/.//evil.tld',
    '/%2e%2e//evil.tld',
    '/x/%2e/%2e%2e//evil.tld?q=1',
    '/x/..//evil.tld#frag',
    '/\tevil',
    '/login',
    '/auth/confirm',
    '/x/../mfa/verify',
    `/${'a'.repeat(512)}`,
  ])('rejects %j', (value) => {
    expect(safeNextPath(value, '/fallback')).toBe('/fallback');
  });

  it.each([
    ['/profile', '/profile'],
    ['/vacancies?status=open', '/vacancies?status=open'],
    ['/candidates/../profile', '/profile'],
    ['/%2F%2Fevil.tld', '/%2F%2Fevil.tld'],
  ])('keeps the same-origin path %j', (value, expected) => {
    const result = safeNextPath(value, '/fallback');
    expect(result).toBe(expected);
    expect(new URL(result, 'https://app.example').origin).toBe(
      'https://app.example',
    );
  });
});
