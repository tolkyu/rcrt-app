export const AUDIT_PERIODS = ['today', '7d', '30d', '365d'] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

/** Built-in Intl keeps date-fns out of the client bundle (PERF-04); parts avoid relying on a locale's date pattern. */
const kyivDayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DAY_MS = 86_400_000;

function kyivDate(at: Date) {
  const parts = Object.fromEntries(
    kyivDayFormat.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const PERIOD_DAYS: Record<AuditPeriod, number> = {
  today: 0,
  '7d': 6,
  '30d': 29,
  '365d': 364,
};

/** Preset → inclusive Kyiv calendar dates; «Останні 7 днів» = today and the six days before. */
export function auditPeriodRange(period: AuditPeriod, now: Date) {
  const to = kyivDate(now);
  const from = new Date(
    Date.parse(`${to}T00:00:00Z`) - PERIOD_DAYS[period] * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  return { from, to };
}
