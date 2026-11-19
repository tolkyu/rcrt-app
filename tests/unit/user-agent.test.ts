import { describe, expect, it } from 'vitest';
import { describeDevice, isPhoneUserAgent } from '@/lib/user-agent';

it.each([
  [
    'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36',
    'Chrome',
    '130',
    'Windows',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36 Edg/131.0',
    'Edge',
    '131',
    'Windows',
  ],
  [
    'Mozilla/5.0 (iPhone) Version/18.1 Mobile/15 Safari/604.1',
    'Safari',
    '18',
    'iOS',
  ],
  [
    'Mozilla/5.0 (iPad) FxiOS/130.1 Mobile/15 Safari/604.1',
    'Firefox',
    '130',
    'iOS',
  ],
])(
  'keeps the browser precedence and exposes only its major version when requested',
  (agent, browser, version, os) => {
    expect(describeDevice(agent)).toEqual({ browser, os });
    expect(describeDevice(agent, true)).toEqual({
      browser: `${browser} ${version}`,
      os,
    });
  },
);

it.each([null, '', 'unknown client', 'Chrome/130'])(
  'keeps unknown devices readable',
  (agent) => {
    expect(describeDevice(agent, true)).toBeNull();
  },
);

describe('isPhoneUserAgent [list layout hint]', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
      true,
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      true,
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130 Safari/537.36',
      false,
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
      false,
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1',
      false,
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      false,
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      false,
    ],
    [
      'Mozilla/5.0 (Android 14; Tablet; rv:130.0) Gecko/130.0 Firefox/130.0',
      false,
    ],
    [null, false],
  ])('%s → %s', (userAgent, expected) => {
    expect(isPhoneUserAgent(userAgent)).toBe(expected);
  });
});
