import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientIp, requestMeta } from '../../../server/context/request-context';

afterEach(() => {
  vi.unstubAllEnvs();
});
const forged = {
  'x-forwarded-for': '192.0.2.1',
  'x-real-ip': '192.0.2.2',
  'x-vercel-forwarded-for': '192.0.2.3',
  'x-vercel-id': 'attacker',
};

describe('Trusted client IP boundary [SEC-T4-08]', () => {
  it('ignores every client-supplied proxy header outside trusted Vercel deployments', () => {
    expect(clientIp(new Headers(forged), false)).toBeNull();
  });
  it('uses only the single provider-overwritten header on trusted Vercel', () => {
    expect(clientIp(new Headers(forged), true)).toBe('192.0.2.3');
    expect(
      clientIp(
        new Headers({
          'x-real-ip': '192.0.2.2',
          'x-forwarded-for': '192.0.2.1',
        }),
        true,
      ),
    ).toBeNull();
  });
  it.each(['', 'unknown', '192.0.2.1, 192.0.2.2', 'not-an-ip'])(
    'rejects malformed or multiple trusted-header IPs: %s',
    (value) => {
      expect(
        clientIp(new Headers({ 'x-vercel-forwarded-for': value }), true),
      ).toBeNull();
    },
  );
  it.each([
    ['0', 'production'],
    ['1', 'development'],
    ['1', ''],
    ['', 'production'],
  ])(
    'does not trust request headers with runtime flags VERCEL=%s VERCEL_ENV=%s',
    (vercel, environment) => {
      vi.stubEnv('VERCEL', vercel);
      vi.stubEnv('VERCEL_ENV', environment);
      expect(requestMeta(new Headers(forged)).ip).toBeNull();
    },
  );
  it.each(['production', 'preview'])(
    'uses trusted metadata only in Vercel %s',
    (environment) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_ENV', environment);
      expect(requestMeta(new Headers(forged)).ip).toBe('192.0.2.3');
    },
  );
});
