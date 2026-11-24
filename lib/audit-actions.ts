import { AUDIT_ACTION_GROUPS } from './audit-constants';

const CODES: readonly string[] = Object.values(AUDIT_ACTION_GROUPS).flat();
export const AUDIT_ACTION_COUNT = CODES.length;
const MAX_LENGTH =
  CODES.length * Math.max(...CODES.map((code) => code.length)) +
  CODES.length -
  1;

/** Bound the raw CSV before splitting; only the explicit multi-action contract uses this catalogue. */
export function parseAuditActions(value: string): string[] | undefined {
  if (!value || value.length > MAX_LENGTH) return undefined;
  const codes = value.split(',');
  if (
    codes.length > CODES.length ||
    codes.some((code) => !CODES.includes(code))
  )
    return undefined;
  return CODES.filter((code) => codes.includes(code));
}

export function auditActionSelection(codes: readonly string[]) {
  const selected = CODES.filter((code) => codes.includes(code));
  return {
    action: selected.length === 1 ? selected[0] : undefined,
    actions: selected.length > 1 ? selected.join(',') : undefined,
  };
}
