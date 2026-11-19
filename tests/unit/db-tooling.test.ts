import { TZDate } from '@date-fns/tz';
import { describe, expect, it } from 'vitest';
import { FIXED_CLOCK_ISO, fixedClockNow } from '@/lib/fixed-clock';
import { toolErrorSummary } from '@/server/db/tool-error';

describe('fixed clock', () => {
  it('is Monday 2026-11-16 10:00 in Europe/Kyiv and returns a fresh Date', () => {
    const kyiv = new TZDate(FIXED_CLOCK_ISO, 'Europe/Kyiv');
    expect([kyiv.getFullYear(), kyiv.getMonth(), kyiv.getDate()]).toEqual([
      2026, 10, 16,
    ]);
    expect([kyiv.getDay(), kyiv.getHours(), kyiv.getMinutes()]).toEqual([
      1, 10, 0,
    ]);
    const first = fixedClockNow();
    first.setTime(0);
    expect(fixedClockNow().toISOString()).toBe(FIXED_CLOCK_ISO);
  });
});

describe('database tool error summary', () => {
  const postgresError = Object.assign(
    new Error('duplicate key value (email)=(ivan.real@example.com)'),
    {
      name: 'PostgresError',
      code: '23505',
      constraint_name: 'app_user_email_uq',
    },
  );

  it('reports SQLSTATE and constraint without driver messages', () => {
    expect(toolErrorSummary(postgresError)).toBe(
      'SQLSTATE 23505, constraint app_user_email_uq',
    );
    const wrapped = Object.assign(new TypeError('query failed: params ivan'), {
      cause: postgresError,
    });
    expect(toolErrorSummary(wrapped)).toBe(
      'SQLSTATE 23505, constraint app_user_email_uq',
    );
  });

  it('keeps own messages and codes but drops subclass messages', () => {
    expect(
      toolErrorSummary(new Error('Applied migration checksum mismatch')),
    ).toBe('Error: Applied migration checksum mismatch');
    expect(
      toolErrorSummary(
        Object.assign(new TypeError('value ivan@example.com'), {
          code: 'ERR_X',
        }),
      ),
    ).toBe('TypeError: ERR_X');
    expect(toolErrorSummary('ivan@example.com')).toBe('unknown error');
  });
});
