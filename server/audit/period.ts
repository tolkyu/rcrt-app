import 'server-only';
import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays } from 'date-fns';

const KYIV = 'Europe/Kyiv';

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
