import { normalizeApostrophes } from './apostrophes';

export const POSITION_NAME_MIN = 2;
export const POSITION_NAME_MAX = 80;

// Braille blank and Hangul fillers render empty yet are not Cf; a fixed list, because Default_Ignorable_Code_Point would also reject emoji variation selectors.
const FILLERS = '\\u2800\\u115F\\u1160\\u3164\\uFFA0';

/** Invisible or look-alike code points: control, format (zero-width, bidi), line/paragraph separators, private-use, lone surrogates and blank fillers. */
const FORBIDDEN_CHARS = new RegExp(
  `[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}\\p{Co}\\p{Cs}${FILLERS}]`,
  'u',
);
const VISIBLE_CHAR = new RegExp(`[^\\s\\p{Cf}${FILLERS}]`, 'u');

export const hasOnlyVisibleChars = (value: string): boolean =>
  !FORBIDDEN_CHARS.test(value);

/** True when at least one character renders something; the client twin of the server's «required» check. */
export const hasVisibleChar = (value: string): boolean =>
  VISIBLE_CHAR.test(value);

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
