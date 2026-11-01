import { describe, expect, it } from 'vitest';
import { loginHistoryQuerySchema } from '@/lib/schemas/auth';
import { decodeTimeIdCursor, encodeTimeIdCursor } from '@/lib/schemas/cursor';

describe('Keyset cursor codec [AUD-3, CR-P1-09]', () => {
  it('round-trips the last row position, up to the largest bigint id', () => {
    for (const id of [1n, 42n, 2n ** 63n - 1n]) {
      const cursor = { occurredAt: new Date('2026-11-16T08:00:00.123Z'), id };
      const encoded = encodeTimeIdCursor(cursor);
      expect(decodeTimeIdCursor(encoded)).toEqual(cursor);
      expect(
        loginHistoryQuerySchema.safeParse({ cursor: encoded }).success,
      ).toBe(true);
    }
  });

  it.each([
    '2026-02-30T08:00:00.000Z_1',
    '2026-13-01T08:00:00.000Z_1',
    '2026-11-16T25:00:00.000Z_1',
    '2026-11-16T08:00:00Z_1',
    '2026-11-16T08:00:00.000Z_9223372036854775808',
    '2026-11-16T08:00:00.000Z_99999999999999999999',
    '2026-11-16T08:00:00.000Z_-1',
    '2026-11-16T08:00:00.000Z',
    'garbage',
  ])('rejects %s with a validation error (400)', (cursor) => {
    expect(decodeTimeIdCursor(cursor)).toBeNull();
    const parsed = loginHistoryQuerySchema.safeParse({ cursor });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['cursor']);
  });
});
