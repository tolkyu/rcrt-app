/** One anchor for the demo seed, screenshots and E2E: Mon 2026-11-16 10:00 Europe/Kyiv (docs/test-plan.md). */
export const FIXED_CLOCK_ISO = '2026-11-16T08:00:00.000Z';

export function fixedClockNow(): Date {
  return new Date(FIXED_CLOCK_ISO);
}
