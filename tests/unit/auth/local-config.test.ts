import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(
  new URL('../../../supabase/config.toml', import.meta.url),
  'utf8',
);
function setting(section: string, key: string): unknown {
  const start = config.indexOf(`[${section}]`);
  expect(start, section).toBeGreaterThanOrEqual(0);
  const next = config.indexOf('\n[', start + 1);
  const body = config.slice(start, next === -1 ? undefined : next);
  const value = new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm').exec(body)?.[1];
  expect(value, `${section}.${key}`).toBeDefined();
  return JSON.parse(value!);
}

describe('Local Supabase auth security baseline [T4-B06/C06/D03/I03, SEC-AUTH-R03]', () => {
  it('keeps invite-only access and verified Google identity binding', () => {
    for (const section of ['auth', 'auth.email', 'auth.sms'])
      expect(setting(section, 'enable_signup')).toBe(false);
    expect(setting('auth', 'enable_anonymous_sign_ins')).toBe(false);
    expect(setting('auth', 'enable_manual_linking')).toBe(false);
    expect(setting('auth.external.google', 'skip_nonce_check')).toBe(false);
  });

  it('bounds token expiry and refresh reuse', () => {
    expect(setting('auth', 'jwt_expiry')).toBe(900);
    expect(setting('auth.email', 'otp_expiry')).toBe(900);
    expect(setting('auth', 'enable_refresh_token_rotation')).toBe(true);
    expect(setting('auth', 'refresh_token_reuse_interval')).toBeLessThanOrEqual(
      10,
    );
  });

  it('allows only the exact local confirmation and OAuth callback routes', () => {
    expect(setting('auth', 'additional_redirect_urls')).toEqual([
      'http://localhost:3000/auth/confirm',
      'http://localhost:3000/auth/callback',
    ]);
  });

  it('keeps provider rate limits enabled and the TOTP bridge bounded', () => {
    for (const name of [
      'email_sent',
      'sign_in_sign_ups',
      'token_verifications',
    ])
      expect(setting('auth.rate_limit', name)).toBeGreaterThan(0);
    expect(setting('auth.mfa', 'max_enrolled_factors')).toBe(3);
    expect(setting('auth.mfa.totp', 'enroll_enabled')).toBe(true);
    expect(setting('auth.mfa.totp', 'verify_enabled')).toBe(true);
  });
});
