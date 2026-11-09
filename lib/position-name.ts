/** Invisible or look-alike code points: control, format (zero-width, bidi), line/paragraph separators, private-use and lone surrogates. */
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]/u;

/** Straight and curly quotes, grave and acute accents that people type instead of the Ukrainian apostrophe ʼ (U+02BC). */
const APOSTROPHE_VARIANTS = /['‘’`´]/g;
const MODIFIER_APOSTROPHE = String.fromCharCode(0x02bc);

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
  normalizePositionName(value)
    .replace(APOSTROPHE_VARIANTS, MODIFIER_APOSTROPHE)
    .toLowerCase()
    .normalize('NFC');
