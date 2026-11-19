import { z } from 'zod';
import { hasOnlyReasonChars, normalizeReason } from '../reason-text';

/** Free text that may span lines (D113): line breaks are kept, other control characters are refused; length is counted after `normalizeReason`. May end up empty. */
export const multilineText = (max: number) =>
  z
    .string()
    .refine(hasOnlyReasonChars, 'invalid_chars')
    .overwrite(normalizeReason)
    .max(max);

/** A required multiline reason (D113). */
export const multilineReason = (max: number) => multilineText(max).min(1);
