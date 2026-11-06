import { describe, expect, it } from 'vitest';
import {
  assessAuthDrift,
  checkHostedAuth,
} from '../../scripts/auth-drift-check';

const origin = 'https://hiring.fixture.test';
const config = {
  disable_signup: true,
  external_email_enabled: true,
  refresh_token_rotation_enabled: true,
  mailer_secure_email_change_enabled: true,
  security_update_password_require_reauthentication: true,
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  external_anonymous_users_enabled: false,
  security_manual_linking_enabled: false,
  external_phone_enabled: false,
  external_google_skip_nonce_check: false,
  external_google_email_optional: false,
  mfa_phone_enroll_enabled: false,
  mfa_phone_verify_enabled: false,
  external_google_enabled: true,
  jwt_exp: 900,
  mailer_otp_exp: 900,
  site_url: origin,
  security_refresh_token_reuse_interval: 10,
  mfa_max_enrolled_factors: 3,
  rate_limit_email_sent: 10,
  rate_limit_token_refresh: 150,
  rate_limit_verify: 30,
  rate_limit_otp: 30,
  uri_allow_list: `${origin}/auth/confirm,${origin}/auth/callback`,
  mailer_templates_magic_link_content:
    '<a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=email">Увійти</a>',
  smtp_host: 'smtp.fixture.test',
};
const keys = { keys: [{ algorithm: 'ES256', status: 'in_use' }] };
const users = { demoUsers: 0, passwords: 0 };

describe('Hosted Auth drift assessment [P1-03, T4-L01]', () => {
  it('accepts only the explicit deployment baseline without hosted access', () => {
    expect(() =>
      assessAuthDrift(config, keys, users, origin, true),
    ).not.toThrow();
  });
  it.each([
    { disable_signup: false },
    { security_manual_linking_enabled: true },
    { jwt_exp: 3600 },
    { mailer_otp_exp: 3600 },
    { refresh_token_rotation_enabled: false },
    { external_google_skip_nonce_check: true },
    { external_anonymous_users_enabled: true },
    { external_github_enabled: true },
    { mfa_max_enrolled_factors: 2 },
    { mfa_max_enrolled_factors: 10 },
    { security_refresh_token_reuse_interval: 11 },
    { rate_limit_otp: 0 },
    { uri_allow_list: `${origin}/**` },
    { smtp_host: '' },
    { mailer_templates_magic_link_content: '{{ .ConfirmationURL }}' },
  ])('fails closed on security drift %j', (change) => {
    expect(() =>
      assessAuthDrift({ ...config, ...change }, keys, users, origin, true),
    ).toThrow('Auth configuration drift:');
  });
  it.each([
    { keys: [{ algorithm: 'HS256', status: 'in_use' }] },
    { keys: [{ algorithm: 'ES256', status: 'standby' }] },
    { keys: [] },
  ])('rejects legacy or inactive signing keys %j', (keyInput) => {
    expect(() =>
      assessAuthDrift(config, keyInput, users, origin, true),
    ).toThrow('active_signing_key');
  });
  it.each([
    { demoUsers: 1, passwords: 0 },
    { demoUsers: 0, passwords: 1 },
  ])('rejects demo/password identities using counts only', (summary) => {
    expect(() => assessAuthDrift(config, keys, summary, origin, true)).toThrow(
      'Auth configuration drift:',
    );
  });
  it('rejects malformed responses without including confidential input in errors', () => {
    expect(() =>
      assessAuthDrift({ secret: 'do-not-log' }, {}, {}, origin, true),
    ).toThrow('Auth drift response shape is invalid');
  });
  it('refuses incomplete configuration before making hosted calls', async () => {
    await expect(checkHostedAuth({})).rejects.toThrow(
      'Auth drift requires explicit',
    );
  });
});
