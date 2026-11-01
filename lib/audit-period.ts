import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays } from 'date-fns';

const KYIV = 'Europe/Kyiv';
export const AUDIT_PERIODS = ['today', '7d', '30d', '365d'] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

/** `en-CA` formats as YYYY-MM-DD; built-in Intl keeps date-fns out of the client bundle (PERF-04). */
const kyivDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: KYIV,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DAY_MS = 86_400_000;

const PERIOD_DAYS: Record<AuditPeriod, number> = {
  today: 0,
  '7d': 6,
  '30d': 29,
  '365d': 364,
};

/** Preset → inclusive Kyiv calendar dates; «Останні 7 днів» = today and the six days before. */
export function auditPeriodRange(period: AuditPeriod, now: Date) {
  const to = kyivDayFormat.format(now);
  const from = new Date(
    Date.parse(`${to}T00:00:00Z`) - PERIOD_DAYS[period] * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  return { from, to };
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
