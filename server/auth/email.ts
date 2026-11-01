/** Emails compare case-insensitively after trimming; aliases and plus-addresses are different accounts (SEC-AUTH-2). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return Boolean(a && b) && normalizeEmail(a!) === normalizeEmail(b!);
}
