import { normalizePositionName } from '@/lib/position-name';

const codePoints = (value: string): number => Array.from(value).length;

/**
 * Length after the `line()` normalisation (NFC, collapsed whitespace, trim), in the Unicode code points Zod 4.6 counts
 * (a surrogate pair is 1, a family emoji is 5). Correct only for schemas that apply `normalizePositionName`
 * (titles, vacancy reasons, names); for trim-only schemas use `trimmedTextLength`.
 * `tests/unit/text-length.test.ts` pins both against the real schemas, so a Zod upgrade that changes the counting fails there.
 */
export const serverTextLength = (value: string): number =>
  codePoints(normalizePositionName(value));

/** Length for schemas that only `.trim()` before `.max()` (`auth.ts` reason, `user.ts` search and reason): no NFC, inner whitespace kept. */
export const trimmedTextLength = (value: string): number =>
  codePoints(value.trim());
