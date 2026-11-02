import type { BuiltinRole } from '@/server/authz/types';
export { GLOBAL_ROLE_CODES, isAdminAssignment } from '@/server/authz/types';

/** Display order: widest role first, so the top-bar summary shows the most relevant one (D64). */
export const ROLE_DISPLAY_ORDER: readonly BuiltinRole[] = [
  'ADMIN',
  'HEAD_RECRUITER',
  'HEAD_HR',
  'RECRUITER',
  'HR',
  'TEAM_LEAD',
  'FINANCE',
];

export interface RoleView {
  readonly role: string;
  readonly vertical: { readonly id: string; readonly name: string } | null;
}

/** `custom:*` roles share one label until custom-role names exist (ROLE-04). */
export type RoleLabelKey = BuiltinRole | 'custom';

export function roleLabelKey(role: string): RoleLabelKey {
  return ROLE_DISPLAY_ORDER.find((code) => code === role) ?? 'custom';
}

function rank(role: string): number {
  const index = ROLE_DISPLAY_ORDER.findIndex((code) => code === role);
  return index === -1 ? ROLE_DISPLAY_ORDER.length : index;
}

export function sortRoles<T extends RoleView>(roles: readonly T[]): T[] {
  return [...roles].sort(
    (a, b) =>
      rank(a.role) - rank(b.role) ||
      (a.vertical?.name ?? '').localeCompare(b.vertical?.name ?? '', 'uk'),
  );
}

/** «Рекрутер · Гемблінг +1»: the first assignment in display order plus how many others exist. */
export function roleSummary(
  roles: readonly RoleView[],
): { readonly primary: RoleView; readonly others: number } | null {
  const [primary, ...rest] = sortRoles(roles);
  return primary ? { primary, others: rest.length } : null;
}
