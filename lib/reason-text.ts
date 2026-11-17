import { hasOnlyVisibleChars } from '@/lib/visible-text';

/** Reason text may break lines and carry tabs (D113); every other control, zero-width or bidi character is still refused. */
export const hasOnlyReasonChars = (value: string): boolean =>
  hasOnlyVisibleChars(value.replace(/[\t\n\r]/g, ''));

/** Stored reason: NFC, CRLF/CR as LF, spaces collapsed and trimmed; internal line breaks stay as typed (D113). */
export const normalizeReason = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
