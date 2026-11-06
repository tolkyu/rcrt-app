import { describe, expect, it } from 'vitest';
import { lighthouseSummary } from '../perf/lighthouse-budget';

const valid = { lcp: 600, cls: 0, tbt: 20 };

describe('Lighthouse budget gate [STORY-FND-2, PERF-03]', () => {
  it('uses medians of three runs and treats TBT as a diagnostic', () => {
    expect(
      lighthouseSummary(
        [
          valid,
          { ...valid, lcp: 700, tbt: 400 },
          { ...valid, lcp: 1800, tbt: 900 },
        ],
        false,
      ),
    ).toEqual({
      lcp: 700,
      cls: 0,
      tbt: 400,
      budgets: { lcp: 1200, cls: 0.05 },
      passed: true,
    });
  });
  it.each([
    [false, 1200, 0],
    [true, 2500, 0],
    [false, 600, 0.05],
    [true, 600, 0.1],
  ] as const)(
    'rejects existing hard budget boundary mobile=%s lcp=%s cls=%s',
    (mobile, lcp, cls) => {
      expect(
        lighthouseSummary(
          Array.from({ length: 3 }, () => ({ lcp, cls, tbt: 20 })),
          mobile,
        ).passed,
      ).toBe(false);
    },
  );
  it.each([NaN, Infinity, -1, 0])(
    'rejects an invalid LCP instead of passing it: %s',
    (lcp) => {
      expect(() =>
        lighthouseSummary([{ ...valid, lcp }, valid, valid], false),
      ).toThrow('invalid metric');
    },
  );
  it('refuses incomplete runs and missing/negative diagnostics', () => {
    expect(() => lighthouseSummary([valid, valid], false)).toThrow(
      'three successful',
    );
    expect(() =>
      lighthouseSummary([{ ...valid, cls: NaN }, valid, valid], false),
    ).toThrow('invalid metric');
    expect(() =>
      lighthouseSummary([{ ...valid, tbt: -1 }, valid, valid], false),
    ).toThrow('invalid metric');
  });
});
