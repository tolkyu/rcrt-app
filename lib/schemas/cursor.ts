import { z } from 'zod';

export const MAX_BIGINT_ID = 2n ** 63n - 1n;
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d{1,19})$/;

/** Keyset position `(occurred_at, id)` for lists ordered newest first by a bigint id. */
export interface TimeIdCursor {
  readonly occurredAt: Date;
  readonly id: bigint;
}

export function encodeTimeIdCursor(cursor: TimeIdCursor): string {
  return `${cursor.occurredAt.toISOString()}_${cursor.id.toString()}`;
}

/** `null` for anything not produced by `encodeTimeIdCursor`: impossible dates and ids beyond bigint. */
export function decodeTimeIdCursor(value: string): TimeIdCursor | null {
  const match = CURSOR.exec(value);
  if (!match) return null;
  const occurredAt = new Date(match[1]!);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.toISOString() !== match[1]
  )
    return null;
  const id = BigInt(match[2]!);
  return id <= MAX_BIGINT_ID ? { occurredAt, id } : null;
}

export const timeIdCursorSchema = z
  .string()
  .max(64)
  .regex(CURSOR)
  .refine((value) => decodeTimeIdCursor(value) !== null, {
    message: 'invalid_cursor',
  })
  .meta({
    description: 'Opaque `nextCursor` from the previous page.',
    example: '2026-11-16T08:00:00.000Z_42',
  });
