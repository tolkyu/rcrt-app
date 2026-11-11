import { normalizeApostrophes } from './apostrophes';

export const POSITION_NAME_MIN = 2;
export const POSITION_NAME_MAX = 80;

/** Invisible or look-alike code points: control, format (zero-width, bidi), line/paragraph separators, private-use and lone surrogates. */
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]/u;

export const hasOnlyVisibleChars = (value: string): boolean =>
  !FORBIDDEN_CHARS.test(value);

/** Canonical stored form: NFC, runs of whitespace collapsed to one space, trimmed. */
export const normalizePositionName = (value: string): string =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * Duplicate-detection key computed in app code, because SQL `lower()` follows the database `LC_CTYPE`
 * (Supabase may use `C`, which does not fold Cyrillic). Apostrophe variants are equated here only; the stored name keeps what was typed.
 */
export const positionNameKey = (value: string): string =>
  normalizeApostrophes(normalizePositionName(value))
    .toLowerCase()
    .normalize('NFC');

export type PositionNameProblem =
  'required' | 'tooShort' | 'tooLong' | 'invalid';

/** Client-side twin of `positionNameSchema` that stays free of the Zod bundle; the server remains the arbiter. */
export function positionNameProblem(value: string): PositionNameProblem | null {
  if (!hasOnlyVisibleChars(value)) return 'invalid';
  const { length } = normalizePositionName(value);
  if (length === 0) return 'required';
  if (length < POSITION_NAME_MIN) return 'tooShort';
  if (length > POSITION_NAME_MAX) return 'tooLong';
  return null;
}
