import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  auditPageSearch,
  auditQuery,
  auditWindowMoved,
  nextAuditPageParam,
  previousAuditPageParam,
  type AuditPageParam,
} from '@/lib/queries/settings';
import {
  auditQuerySchema,
  type AuditEntry,
  type AuditPage,
} from '@/lib/schemas/audit';
import { encodeTimeIdCursor } from '@/lib/schemas/cursor';

const CURSOR = '2026-11-16T08:00:00.000Z_42';
const PAGE = 50;

function entry(id: number): AuditEntry {
  return {
    id: String(id),
    occurredAt: new Date(Date.UTC(2026, 10, 1) + id * 1000).toISOString(),
    actor: null,
    actorKind: 'SYSTEM',
    action: 'vertical.created',
    result: 'SUCCESS',
    entity: null,
    ip: null,
  };
}

const cursorOf = (item: AuditEntry) =>
  encodeTimeIdCursor({
    occurredAt: new Date(item.occurredAt),
    id: BigInt(item.id),
  });

/** In-memory `/audit` with the API contract: items newest first, `prevCursor`/`nextCursor` by side (STORY-AUD-4). */
function fakeAudit(count: number) {
  const rows = Array.from({ length: count }, (_, index) =>
    entry(count - index),
  );
  const requests: AuditPageParam[] = [];
  const page = (param: AuditPageParam): AuditPage => {
    requests.push(param);
    const at = param
      ? rows.findIndex((row) => cursorOf(row) === param.cursor)
      : -1;
    const newer = param?.direction === 'newer';
    const start = newer ? Math.max(0, at - PAGE) : at + 1;
    const items = rows.slice(start, newer ? at : start + PAGE);
    const more = newer ? start > 0 : start + PAGE < rows.length;
    return {
      items,
      nextCursor:
        (newer || more) && items.length ? cursorOf(items.at(-1)!) : null,
      prevCursor:
        param && (!newer || more) && items.length ? cursorOf(items[0]!) : null,
    };
  };
  return {
    rows,
    requests,
    page,
    prepend: () => rows.unshift(entry(Number(rows[0]!.id) + 1)),
  };
}

function observe(server: ReturnType<typeof fakeAudit>) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const observer = new InfiniteQueryObserver(client, {
    ...auditQuery({ result: 'DENIED' }),
    queryFn: ({ pageParam }) => Promise.resolve(server.page(pageParam)),
  });
  const unsubscribe = observer.subscribe(() => undefined);
  const ids = () =>
    observer
      .getCurrentResult()
      .data!.pages.flatMap((page) => page.items.map((item) => Number(item.id)));
  return { observer, ids, unsubscribe };
}

describe('Audit page parameters [STORY-AUD-4]', () => {
  it('keeps legacy cursor-only URLs for older pages and adds direction only for newer ones', () => {
    const filters = { result: 'DENIED' as const, view: undefined };
    expect(auditPageSearch(filters, null).toString()).toBe('result=DENIED');
    expect(
      auditPageSearch(filters, {
        cursor: CURSOR,
        direction: 'older',
      }).toString(),
    ).toBe(`result=DENIED&cursor=${encodeURIComponent(CURSOR)}`);
    expect(
      auditPageSearch(filters, {
        cursor: CURSOR,
        direction: 'newer',
      }).toString(),
    ).toBe(
      `result=DENIED&cursor=${encodeURIComponent(CURSOR)}&direction=newer`,
    );
  });

  it('maps nextCursor to an older param and prevCursor to a newer param, null at either end', () => {
    const page = { items: [], nextCursor: CURSOR, prevCursor: null };
    expect(nextAuditPageParam(page)).toEqual({
      cursor: CURSOR,
      direction: 'older',
    });
    expect(previousAuditPageParam(page)).toBeNull();
    const top = { items: [], nextCursor: null, prevCursor: CURSOR };
    expect(nextAuditPageParam(top)).toBeNull();
    expect(previousAuditPageParam(top)).toEqual({
      cursor: CURSOR,
      direction: 'newer',
    });
  });

  it.each([
    [[null], false],
    [[null, { cursor: CURSOR, direction: 'older' }], true],
    [[{ cursor: CURSOR, direction: 'older' }], true],
    [[{ cursor: CURSOR, direction: 'newer' }], true],
  ] as const)('restarts a moved window %j: %s', (pageParams, moved) => {
    expect(auditWindowMoved({ pageParams })).toBe(moved);
  });

  it.each([
    [{ direction: 'newer', cursor: CURSOR }, true],
    [{ direction: 'older', cursor: CURSOR }, true],
    [{ direction: 'older' }, true],
    [{ cursor: CURSOR }, true],
    [{ direction: 'newer' }, false],
    [{ direction: 'NEWER', cursor: CURSOR }, false],
    [{ direction: '', cursor: CURSOR }, false],
    [{ direction: ['newer', 'older'], cursor: CURSOR }, false],
  ])('parses %j → %s', (input, valid) => {
    expect(auditQuerySchema.safeParse(input).success).toBe(valid);
  });
});

describe('Bounded two-page window [STORY-AUD-4, PERF-05]', () => {
  it('evicts the newest page going older, returns to the newest going newer, without duplicates', async () => {
    const server = fakeAudit(180);
    const { observer, ids, unsubscribe } = observe(server);
    try {
      await observer.refetch();
      expect(observer.getCurrentResult().hasPreviousPage).toBe(false);
      await observer.fetchNextPage();
      expect(observer.getCurrentResult().hasPreviousPage).toBe(false);
      await observer.fetchNextPage();
      expect(ids()).toEqual(
        server.rows.slice(50, 150).map((row) => Number(row.id)),
      );
      expect(observer.getCurrentResult().hasPreviousPage).toBe(true);
      await observer.fetchNextPage();
      expect(ids()).toHaveLength(80);
      expect(observer.getCurrentResult().hasNextPage).toBe(false);
      await observer.fetchPreviousPage();
      expect(ids()).toEqual(
        server.rows.slice(50, 150).map((row) => Number(row.id)),
      );
      expect(observer.getCurrentResult().hasNextPage).toBe(true);
      await observer.fetchPreviousPage();
      const result = observer.getCurrentResult();
      expect(ids()).toEqual(
        server.rows.slice(0, 100).map((row) => Number(row.id)),
      );
      expect(new Set(ids()).size).toBe(100);
      expect(result.data!.pages).toHaveLength(2);
      expect(result.hasPreviousPage).toBe(false);
      expect(auditWindowMoved(result.data!)).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it('refetches a moved window from its first boundary, keeping its size; later rows only re-enable «Показати новіші»', async () => {
    const server = fakeAudit(200);
    const { observer, ids, unsubscribe } = observe(server);
    try {
      await observer.refetch();
      await observer.fetchNextPage();
      await observer.fetchNextPage();
      await observer.fetchNextPage();
      await observer.fetchPreviousPage();
      const retained = ids();
      expect(retained).toEqual(
        server.rows.slice(50, 150).map((row) => Number(row.id)),
      );
      server.requests.length = 0;
      await observer.refetch();
      expect(ids()).toEqual(retained);
      expect(server.requests).toEqual([
        { cursor: cursorOf(server.rows[100]!), direction: 'newer' },
        { cursor: cursorOf(server.rows[99]!), direction: 'older' },
      ]);
      server.prepend();
      await observer.refetch();
      expect(ids()).toEqual(retained);
      expect(observer.getCurrentResult().hasPreviousPage).toBe(true);
      await observer.fetchPreviousPage();
      expect(ids()).toEqual(
        server.rows.slice(1, 101).map((row) => Number(row.id)),
      );
      await observer.fetchPreviousPage();
      expect(ids()[0]).toBe(Number(server.rows[0]!.id));
      expect(observer.getCurrentResult().hasPreviousPage).toBe(false);
    } finally {
      unsubscribe();
    }
  });
});
