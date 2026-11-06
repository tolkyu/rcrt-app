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
});
