import { describe, expect, it } from 'vitest';
import { AUDIT_ACTION_GROUPS } from '@/lib/audit-constants';
import {
  auditApiFilters,
  auditSearchParams,
  parseAuditSearch,
  selectedAuditActions,
} from '@/lib/audit-filters';
import { auditQuerySchema } from '@/lib/schemas/audit';
import { auditQuery } from '@/lib/queries/settings';
import { AUDIT_ACTION_COUNT } from '@/lib/audit-actions';

const catalogue = Object.values(AUDIT_ACTION_GROUPS).flat();
const first = 'user.invited';
const last = 'vertical.renamed';

describe('Bounded action-list API contract [STORY-AUD-2, FND-4]', () => {
  it('preserves legacy single-action validation, including unknown but syntactically valid codes', () => {
    expect(auditQuerySchema.parse({ action: 'future.action' }).action).toBe(
      'future.action',
    );
    expect(auditQuerySchema.safeParse({ action: 'bad action' }).success).toBe(
      false,
    );
    expect(auditQuerySchema.safeParse({ action: [first, last] }).success).toBe(
      false,
    );
  });

  it('accepts every current action together and canonicalises reordered duplicates', () => {
    expect(
      auditQuerySchema.safeParse({ actions: catalogue.join(',') }).success,
    ).toBe(true);
    expect(
      auditQuerySchema.parse({ actions: `${last},${first},${last}` }).actions,
    ).toBe(`${first},${last}`);
  });

  it.each([
    '',
    'future.action',
    'user.invited,',
    ',user.invited',
    'user.invited,,vertical.renamed',
    'user.invited, vertical.renamed',
    'USER.INVITED',
    'user.invited;vertical.renamed',
    'a'.repeat(2000),
    Array.from({ length: AUDIT_ACTION_COUNT + 1 }, () => first).join(','),
    [first, last],
  ])('rejects malformed, unknown or unbounded new actions: %j', (actions) => {
    expect(auditQuerySchema.safeParse({ actions }).success).toBe(false);
  });

  it.each([
    { action: first, actions: last },
    { action: first, actions: first },
    { action: '', actions: first },
  ])('rejects dual action transports: %j', (input) => {
    expect(auditQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe('Canonical action URLs and query identity [STORY-AUD-2]', () => {
  it('round-trips a deduplicated catalogue-ordered OR set without emitting both keys', () => {
    const search = parseAuditSearch({
      actions: `${last},${first},${last}`,
      result: 'DENIED',
    });
    expect(selectedAuditActions(search)).toEqual([first, last]);
    const params = auditSearchParams(search);
    expect(params.get('actions')).toBe(`${first},${last}`);
    expect(params.has('action')).toBe(false);
    expect(parseAuditSearch(Object.fromEntries(params))).toEqual(search);
    expect(
      auditApiFilters(search, new Date('2026-11-16T08:00:00Z')),
    ).toMatchObject({
      actions: `${first},${last}`,
      result: 'DENIED',
    });
  });

  it('emits one selection through the legacy key and omits both when empty', () => {
    const single = auditSearchParams(
      parseAuditSearch({ actions: `${first},${first}` }),
    );
    expect(single.get('action')).toBe(first);
    expect(
      selectedAuditActions(parseAuditSearch({ actions: `${first},${first}` })),
    ).toEqual([first]);
    expect(single.has('actions')).toBe(false);
    expect(selectedAuditActions(parseAuditSearch({}))).toEqual([]);
    const empty = auditSearchParams(parseAuditSearch({}));
    expect(empty.has('action')).toBe(false);
    expect(empty.has('actions')).toBe(false);
  });

  it.each([
    { actions: 'future.action' },
    { actions: `${first},future.action` },
    { action: first, actions: last },
    { actions: [first, last] },
    { action: [first, last] },
    {
      actions: Array.from({ length: AUDIT_ACTION_COUNT + 1 }, () => first).join(
        ',',
      ),
    },
  ])(
    'drops invalid page selection without losing unrelated valid filters: %j',
    (input) => {
      const params = auditSearchParams(
        parseAuditSearch({ ...input, result: 'DENIED' }),
      );
      expect(params.has('action')).toBe(false);
      expect(params.has('actions')).toBe(false);
      expect(params.get('result')).toBe('DENIED');
    },
  );

  it('shares a cache key for equivalent selections', () => {
    const now = new Date('2026-11-16T08:00:00Z');
    const query = (actions: string) =>
      auditQuery(auditApiFilters(parseAuditSearch({ actions }), now));
    const a = query(`${first},${last}`);
    const b = query(`${last},${first},${last}`);
    const c = query('auth.login_failed');
    expect(a.queryKey).toEqual(b.queryKey);
    expect(a.queryKey).not.toEqual(c.queryKey);
  });

  it.each([
    'action=user.invited&action=vertical.renamed&result=DENIED',
    'actions=user.invited&actions=vertical.renamed&result=DENIED',
    'action=&actions=user.invited&result=DENIED',
    'actions=vertical.renamed,user.invited,user.invited&result=DENIED',
    'period=today&period=30d&actions=user.invited,vertical.renamed',
    'view=security&view=all&actions=user.invited,vertical.renamed',
    'view=unknown&actions=user.invited,vertical.renamed',
    'view=security&actions=auth.login_failed,user.invited',
  ])(
    'normalises SSR arrays and client URLSearchParams identically: %s',
    (raw) => {
      const params = new URLSearchParams(raw);
      const server = Object.fromEntries(
        [...new Set(params.keys())].map((key) => {
          const values = params.getAll(key);
          return [key, values.length === 1 ? values[0] : values];
        }),
      );
      expect(parseAuditSearch(params)).toEqual(parseAuditSearch(server));
    },
  );
});

describe('Security scope preserves the independent manual selection [STORY-AUD-2, Q-158]', () => {
  it('keeps security in URLs, API filters and cache identity without trimming the selected OR set', () => {
    const search = parseAuditSearch({
      view: 'security',
      actions: 'vertical.renamed,auth.login_failed,user.invited',
      result: 'DENIED',
    });
    const params = auditSearchParams(search);
    expect(params.get('view')).toBe('security');
    expect(params.get('actions')).toBe(
      'user.invited,auth.login_failed,vertical.renamed',
    );
    expect(parseAuditSearch(params)).toEqual(search);
    const now = new Date('2026-11-16T08:00:00Z');
    const filters = auditApiFilters(search, now);
    expect(filters).toMatchObject({
      view: 'security',
      actions: 'user.invited,auth.login_failed,vertical.renamed',
      result: 'DENIED',
    });
    const all = auditApiFilters(
      parseAuditSearch({ actions: search.actions }),
      now,
    );
    expect(
      auditQuery(
        auditApiFilters(
          parseAuditSearch({ view: 'all', actions: search.actions }),
          now,
        ),
      ).queryKey,
    ).toEqual(auditQuery(all).queryKey);
    expect(auditQuery(filters).queryKey).not.toEqual(auditQuery(all).queryKey);
  });

  it.each([undefined, 'all', 'invalid', ['security', 'security']])(
    'omits the all/default or invalid page scope %j without losing other filters',
    (view) => {
      const params = auditSearchParams(
        parseAuditSearch({ view, action: first }),
      );
      expect(params.has('view')).toBe(false);
      expect(params.get('action')).toBe(first);
    },
  );

  it('validates the transport scope and survives the route/service double parse', () => {
    for (const view of ['security', 'all']) {
      const parsed = auditQuerySchema.parse({
        view,
        actions: `${last},${first}`,
      });
      expect(auditQuerySchema.parse(parsed)).toEqual(parsed);
    }
    for (const view of [
      '',
      'SECURITY',
      'invalid',
      ['security'],
      ['all', 'security'],
    ])
      expect(auditQuerySchema.safeParse({ view }).success).toBe(false);
  });
});
