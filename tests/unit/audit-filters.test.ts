import { describe, expect, it } from 'vitest';
import {
  auditApiFilters,
  auditSearchParams,
  parseAuditSearch,
  validAuditPeriod,
} from '@/lib/audit-filters';

const id = '00000000-0000-4000-8000-000000000001';

describe('Audit shareable filter state [STORY-AUD-2, VIS-01]', () => {
  it.each([
    ['2026-02-29', '2026-03-01', false],
    ['2024-02-29', '2024-02-29', true],
    ['2026-00-01', '2026-01-01', false],
    ['2026-01-01', '2026-13-01', false],
    ['2026-1-01', '2026-01-01', false],
    ['', '', false],
    ['2025-10-31', '2026-10-31', true],
    ['2025-10-30', '2026-10-31', false],
  ] as const)(
    'validates custom period %s through %s: %s',
    (from, to, valid) => {
      expect(validAuditPeriod(from, to)).toBe(valid);
    },
  );
  it('round-trips a custom Kyiv date interval without recomputing it from the clock', () => {
    const search = parseAuditSearch({
      period: 'custom',
      from: '2026-10-24',
      to: '2026-10-26',
    });
    expect(
      parseAuditSearch(Object.fromEntries(auditSearchParams(search))),
    ).toEqual(search);
    expect(
      auditApiFilters(search, new Date('2027-01-01T12:00:00Z')),
    ).toMatchObject({
      from: '2026-10-24',
      to: '2026-10-26',
    });
  });

  it.each([
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-11-01', to: '2026-10-01' },
    { from: '2026-11-01' },
    { from: '2025-01-01', to: '2026-11-01' },
  ])('does not carry an invalid custom interval into the API: %j', (dates) => {
    const search = parseAuditSearch({ period: 'custom', ...dates });
    expect(search.period).toBe('7d');
    expect(search.from).toBeUndefined();
    expect(search.to).toBeUndefined();
  });

  it('round-trips supported filters and the open record', () => {
    const search = parseAuditSearch({
      period: '30d',
      actorId: id,
      entityType: 'vertical',
      entityId: id,
      action: 'vertical.renamed',
      result: 'DENIED',
      record: '42',
    });
    expect(
      parseAuditSearch(Object.fromEntries(auditSearchParams(search))),
    ).toEqual(search);
    expect(auditApiFilters(search, new Date('2026-11-16T08:00:00Z'))).toEqual({
      from: '2026-10-18',
      to: '2026-11-16',
      actorId: id,
      entityType: 'vertical',
      entityId: id,
      action: 'vertical.renamed',
      result: 'DENIED',
    });
  });

  it('drops malformed, duplicated and unsupported URL values', () => {
    const search = parseAuditSearch({
      period: ['today', '30d'],
      actorId: 'someone',
      entityType: 'candidate',
      entityId: id,
      action: 'unknown.action',
      result: 'admin',
      record: '../42',
    });
    expect(auditSearchParams(search).toString()).toBe('');
    expect(search.period).toBe('7d');
  });

  it('drops an entity id unless a supported entity type accompanies it', () => {
    expect(parseAuditSearch({ entityId: id }).entityId).toBeUndefined();
    expect(
      parseAuditSearch({ entityType: 'vertical', entityId: 'bad' }).entityId,
    ).toBeUndefined();
  });
});
