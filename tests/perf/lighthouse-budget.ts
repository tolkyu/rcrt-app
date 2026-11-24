export const LIGHTHOUSE_ROUTES = [
  '/profile',
  '/settings/users',
  '/settings/verticals',
  '/settings/priorities',
  '/settings/audit',
] as const;

export interface LighthouseSample {
  readonly lcp: number;
  readonly cls: number;
  readonly tbt: number;
}

const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[1]!;

/** Missing/failed audits cannot become zero-valued passing measurements. */
export function lighthouseSummary(
  samples: readonly LighthouseSample[],
  mobile: boolean,
) {
  if (samples.length !== 3)
    throw new Error('Lighthouse requires three successful samples');
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.lcp) ||
      sample.lcp <= 0 ||
      !Number.isFinite(sample.cls) ||
      sample.cls < 0 ||
      !Number.isFinite(sample.tbt) ||
      sample.tbt < 0
    )
      throw new Error('Lighthouse returned an invalid metric');
  }
  const lcp = median(samples.map((sample) => sample.lcp));
  const cls = median(samples.map((sample) => sample.cls));
  const tbt = median(samples.map((sample) => sample.tbt));
  const budgets = { lcp: mobile ? 2500 : 1200, cls: mobile ? 0.1 : 0.05 };
  return {
    lcp,
    cls,
    tbt,
    budgets,
    passed: lcp < budgets.lcp && cls < budgets.cls,
  };
}
