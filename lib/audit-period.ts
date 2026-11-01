import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format, subDays } from 'date-fns';

const KYIV = 'Europe/Kyiv';
export const AUDIT_PERIODS = ['today', '7d', '30d', '365d'] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

const kyivDay = (at: Date) => format(new TZDate(at, KYIV), 'yyyy-MM-dd');

const PERIOD_DAYS: Record<AuditPeriod, number> = {
  today: 0,
  '7d': 6,
  '30d': 29,
  '365d': 364,
};

/** Preset → inclusive Kyiv calendar dates; «Останні 7 днів» = today and the six days before. */
export function auditPeriodRange(period: AuditPeriod, now: Date) {
  const days = PERIOD_DAYS[period];
  return {
    from: kyivDay(subDays(new TZDate(now, KYIV), days)),
    to: kyivDay(now),
  };
}

function kyivMidnight(date: string) {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new TZDate(year, month - 1, day, KYIV);
}

/** Kyiv dates → UTC instants `[from 00:00, day after to 00:00)`; adding a day in the Kyiv zone keeps DST right (STORY-AUD-2). */
export function kyivDateBounds(from?: string, to?: string) {
  return {
    from: from ? new Date(kyivMidnight(from).getTime()) : undefined,
    to: to ? new Date(addDays(kyivMidnight(to), 1).getTime()) : undefined,
  };
}

/** Inclusive length of a Kyiv date range in days. */
export function periodDays(from: string, to: string) {
  return differenceInCalendarDays(kyivMidnight(to), kyivMidnight(from)) + 1;
}
