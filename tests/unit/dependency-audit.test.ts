import { describe, expect, it } from 'vitest';
import { assessAudit } from '../../scripts/check-audit';

const metadata = { vulnerabilities: { high: 0 } };
const empty = { advisories: {}, metadata };
const advisory = {
  module_name: 'fixture-tool',
  severity: 'high',
  url: 'https://github.com/advisories/GHSA-1111-2222-3333',
  findings: [{ paths: ['.>newman>fixture-tool'] }],
};
const policy = [
  {
    ghsa: 'GHSA-1111-2222-3333',
    module: 'fixture-tool',
    severity: 'high',
    pathPrefixes: ['.>newman>'],
  },
];

describe('Dependency audit policy [SEC, T-S06]', () => {
  it('accepts only the reviewed ID, severity, module and development path', () => {
    expect(
      assessAudit(empty, { advisories: { one: advisory }, metadata }, policy),
    ).toBe(1);
  });
  it('never exempts a production advisory', () => {
    expect(() =>
      assessAudit({ advisories: { one: advisory }, metadata }, empty, policy),
    ).toThrow('Production');
  });
  it.each([
    { ...advisory, url: 'https://github.com/advisories/GHSA-new1-new2-new3' },
    { ...advisory, severity: 'critical' },
    { ...advisory, findings: [{ paths: ['.>runtime-package>fixture-tool'] }] },
    { ...advisory, findings: [] },
  ])('rejects new or expanded tooling risk: %j', (entry) => {
    expect(() =>
      assessAudit(empty, { advisories: { one: entry }, metadata }, policy),
    ).toThrow('Unaccepted');
  });
  it('fails closed on a network/error response instead of treating it as a clean audit', () => {
    expect(() =>
      assessAudit({ error: 'unavailable' }, empty, policy),
    ).toThrow();
  });

  describe('time-boxed production exemption', () => {
    const prodAdvisory = {
      ...advisory,
      module_name: 'fixture-runtime',
      findings: [{ paths: ['.>fixture-parent>fixture-runtime'] }],
    };
    const prodReport = { advisories: { one: prodAdvisory }, metadata };
    const exemption = {
      ghsa: 'GHSA-1111-2222-3333',
      module: 'fixture-runtime',
      severity: 'high',
      paths: ['.>fixture-parent>fixture-runtime'],
      reason: 'No fixed version published',
      until: '2026-12-18',
    };
    const before = new Date('2026-11-18T00:00:00Z');

    it('accepts the exact advisory, module, severity and path before the deadline', () => {
      expect(assessAudit(prodReport, empty, policy, [exemption], before)).toBe(
        0,
      );
    });
    it('fails once the deadline has passed', () => {
      expect(() =>
        assessAudit(
          prodReport,
          empty,
          policy,
          [exemption],
          new Date('2026-12-19T00:00:00Z'),
        ),
      ).toThrow('Production');
    });
    it.each([
      {
        ...prodAdvisory,
        url: 'https://github.com/advisories/GHSA-new1-new2-new3',
      },
      { ...prodAdvisory, module_name: 'other-runtime' },
      { ...prodAdvisory, severity: 'critical' },
      {
        ...prodAdvisory,
        findings: [{ paths: ['.>other-parent>fixture-runtime'] }],
      },
      {
        ...prodAdvisory,
        findings: [
          {
            paths: [
              '.>fixture-parent>fixture-runtime',
              '.>app>fixture-runtime',
            ],
          },
        ],
      },
      { ...prodAdvisory, findings: [] },
    ])(
      'still rejects a different or wider production advisory: %j',
      (entry) => {
        expect(() =>
          assessAudit(
            { advisories: { one: entry }, metadata },
            empty,
            policy,
            [exemption],
            before,
          ),
        ).toThrow('Production');
      },
    );
    it('keeps zero tolerance without an exemption', () => {
      expect(() => assessAudit(prodReport, empty, policy, [], before)).toThrow(
        'Production',
      );
    });
  });
});
