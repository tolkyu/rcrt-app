import { expect, it } from 'vitest';
import { describeDevice } from '@/lib/user-agent';

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
