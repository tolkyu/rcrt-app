import { describe, expect, it } from 'vitest';
import mainConfig from '../../playwright.config';
import perfConfig from '../perf/playwright.config';
import lighthouseConfig from '../perf/lighthouse.config';
import { privateDiagnostic, privateError } from '../support/report-privacy';
import {
  isRouteTeardownError,
  safeNetworkError,
} from '../support/safe-network-error';

describe('browser diagnostic privacy [SEC, CI-LOG-01]', () => {
  it.each([
    ['main', mainConfig],
    ['perf', perfConfig],
    ['lighthouse', lighthouseConfig],
  ] as const)('disables automatic Git capture in %s', (_name, config) => {
    expect(config.captureGitInfo).toEqual({ commit: false, diff: false });
  });
  it.each([
    'Cookie: sb-local-auth-token.0=opaque-first; sb-local-auth-token.1=opaque-second',
    'cOoKiE: opaque-first\r\n  opaque-second',
    'Set-Cookie: opaque-first',
    'AUTHORIZATION: Basic opaque-first',
    'Proxy-Authorization: Bearer opaque-first',
    '{"refresh_token":"opaque-first", "access_token":"opaque-second"}',
    'https://fixture.test/confirm?token_hash=opaque-first',
    'Authorization%3A%20opaque-first',
    'Call log:\n- arbitrary request metadata: opaque-first',
  ])('omits the entire credential-bearing diagnostic: %s', (text) => {
    const result = privateDiagnostic(text);
    expect(result).not.toContain('opaque-first');
    expect(result).not.toContain('opaque-second');
    expect(result).toContain('omitted');
  });

  it('retains a useful normal assertion and a safe network code', () => {
    expect(privateDiagnostic('Expected status 200, received 500')).toBe(
      'Expected status 200, received 500',
    );
    expect(
      privateDiagnostic('route.fetch: ECONNRESET\nCookie: opaque-first'),
    ).toContain('ECONNRESET');
  });

  it('never retains credential-bearing cause, stack, value or source snippet', () => {
    const result = privateError({
      message: 'Cookie: opaque-first',
      stack: 'Authorization: opaque-first',
      value: 'refresh_token=opaque-first',
      snippet: 'a literal opaque-first',
      cause: { message: 'Cookie: opaque-first' },
      location: { file: 'fixture.ts', line: 3, column: 2 },
    });
    expect(JSON.stringify(result)).not.toContain('opaque-first');
    expect(result.location).toEqual({ file: 'fixture.ts', line: 3, column: 2 });
  });

  it('wraps unknown failures without serializing the thrown object or retaining cause', () => {
    const error = safeNetworkError('fixed-clock masked API', {
      credential: 'opaque-first',
    });
    expect(error.message).toContain('UNEXPECTED_ERROR');
    expect(error.cause).toBeUndefined();
    expect(error.stack).not.toContain('opaque-first');
  });

  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'socket hang up'])(
    'preserves an unexpected %s failure',
    (message) => {
      const original = new Error(`${message}\nCookie: opaque-first`);
      expect(isRouteTeardownError(original)).toBe(false);
      const error = safeNetworkError('fixed-clock document/RSC', original);
      expect(error.message).toContain('fixed-clock document/RSC failed');
      expect(error.message).not.toContain('opaque-first');
      expect(error.message).toContain(
        message === 'socket hang up' ? 'ECONNRESET' : message,
      );
    },
  );

  it.each(['disposed', 'already handled', 'Target page closed', 'Test ended'])(
    'preserves existing teardown classification for %s',
    (message) => {
      expect(isRouteTeardownError(new Error(message))).toBe(true);
    },
  );
  it('preserves teardown classification from the error name and non-Error throws', () => {
    const error = new Error('navigation aborted');
    error.name = 'TargetClosedError';
    expect(isRouteTeardownError(error)).toBe(true);
    expect(isRouteTeardownError({ toString: () => 'Test ended' })).toBe(true);
  });
});
