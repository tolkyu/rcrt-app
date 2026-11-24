import { describe, expect, it } from 'vitest';
import { auditPeriodRange } from '@/lib/audit-period';
import { kyivDateBounds, periodDays } from '@/server/audit/period';

describe('Audit Kyiv calendar periods [STORY-AUD-2]', () => {
  it.each([
    ['2026-10-30', '2026-10-29T22:00:00.000Z', '2026-10-30T22:00:00.000Z'],
    ['2026-07-01', '2026-06-30T21:00:00.000Z', '2026-07-01T21:00:00.000Z'],
    ['2026-03-29', '2026-03-28T22:00:00.000Z', '2026-03-29T21:00:00.000Z'],
    ['2026-10-25', '2026-10-24T21:00:00.000Z', '2026-10-25T22:00:00.000Z'],
  ])('bounds %s by Kyiv midnights even on DST days', (day, from, to) => {
    const bounds = kyivDateBounds(day, day);
    expect(bounds.from?.toISOString()).toBe(from);
    expect(bounds.to?.toISOString()).toBe(to);
    expect(periodDays(day, day)).toBe(1);
  });

  it('keeps absent period boundaries open', () => {
    expect(kyivDateBounds()).toEqual({ from: undefined, to: undefined });
  });

  it.each([
    ['today', '2026-11-16', '2026-11-16'],
    ['7d', '2026-11-10', '2026-11-16'],
    ['30d', '2026-10-18', '2026-11-16'],
    ['365d', '2025-11-17', '2026-11-16'],
  ] as const)(
    '%s includes today and the preceding calendar days',
    (period, from, to) => {
      expect(
        auditPeriodRange(period, new Date('2026-11-16T08:00:00Z')),
      ).toEqual({ from, to });
    },
  );

  it.each(['UTC', 'Europe/Kyiv', 'America/Los_Angeles'])(
    'uses Kyiv calendar subtraction across autumn DST on a %s host',
    (timezone) => {
      const previous = process.env.TZ;
      process.env.TZ = timezone;
      try {
        expect(
          auditPeriodRange('7d', new Date('2026-10-26T21:30:00Z')),
        ).toEqual({
          from: '2026-10-20',
          to: '2026-10-26',
        });
        expect(
          auditPeriodRange('today', new Date('2026-10-26T22:30:00Z')),
        ).toEqual({ from: '2026-10-27', to: '2026-10-27' });
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );

  it('counts calendar days rather than 24-hour intervals across DST', () => {
    expect(periodDays('2026-03-28', '2026-03-30')).toBe(3);
    expect(periodDays('2026-10-24', '2026-10-26')).toBe(3);
    expect(periodDays('2025-10-31', '2026-10-31')).toBe(366);
  });
});
