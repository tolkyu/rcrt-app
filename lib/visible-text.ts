// Blank yet not Cf; a fixed list, because Default_Ignorable_Code_Point would also reject emoji variation selectors (security L1).
const FILLERS = '\\u2800\\u115F\\u1160\\u3164\\uFFA0';
// Harmless inside visible text (variation selectors belong to emoji) but a value made only of them looks empty.
const BLANK_ALONE =
  '\\u034F\\u17B4\\u17B5\\u180B-\\u180D\\u180F\\uFE00-\\uFE0F\\uFFFC';

const FORBIDDEN_CHARS = new RegExp(
  `[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}\\p{Co}\\p{Cs}${FILLERS}]`,
  'u',
);
// The combining joiner leads the class: after another character the linter reads it as a misleading sequence.
const VISIBLE_CHAR = new RegExp(`[^${BLANK_ALONE}\\s\\p{Cf}${FILLERS}]`, 'u');
const HAS_BLANK_ALONE = new RegExp(`[${BLANK_ALONE}]`, 'u');

export const hasVisibleChar = (value: string): boolean =>
  VISIBLE_CHAR.test(value);

/** For fragments (rich-text nodes): a mark boundary can leave a node of only U+FE0F after its emoji. */
export const hasNoForbiddenChars = (value: string): boolean =>
  !FORBIDDEN_CHARS.test(value);

export const hasOnlyVisibleChars = (value: string): boolean =>
  hasNoForbiddenChars(value) &&
  !(HAS_BLANK_ALONE.test(value) && !hasVisibleChar(value));
