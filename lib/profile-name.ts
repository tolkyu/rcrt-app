export const FULL_NAME_MAX = 120;

export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function fullNameIssue(value: string): 'too_small' | 'too_big' | null {
  return value.length === 0
    ? 'too_small'
    : value.length > FULL_NAME_MAX
      ? 'too_big'
      : null;
}
