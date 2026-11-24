import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_VERIFIED_FACTORS } from '@/server/services/auth/mfa';

describe('GoTrue factor cap matches the app limit [D22, T4-F03, SEC-AUTH-R03]', () => {
  it('allows the verified devices plus exactly one pending enrolment', () => {
    const config = readFileSync(
      new URL('../../../supabase/config.toml', import.meta.url),
      'utf8',
    );
    const section = config.slice(config.indexOf('[auth.mfa]'));
    const cap = /^max_enrolled_factors\s*=\s*(\d+)\s*$/m.exec(section);
    expect(Number(cap?.[1])).toBe(MAX_VERIFIED_FACTORS + 1);
    expect(MAX_VERIFIED_FACTORS + 1).toBe(3);
  });
});
