import { z } from 'zod';
import { hasOnlyReasonChars, normalizeReason } from '../reason-text';

/** Free-text reason that may span lines (D113): line breaks are kept, other control characters are refused; length is counted after `normalizeReason`. */
export const multilineReason = (max: number) =>
  z
    .string()
    .refine(hasOnlyReasonChars, 'invalid_chars')
    .overwrite(normalizeReason)
    .min(1)
    .max(max);
