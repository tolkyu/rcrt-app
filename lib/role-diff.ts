export interface RoleAssignmentRef {
  readonly role: string;
  readonly verticalId: string | null;
}

export const roleAssignmentKey = ({ role, verticalId }: RoleAssignmentRef) =>
  `${role}|${verticalId ?? ''}`;

/** «Змінити ролі» sends the full set; what is stored and shown on the timeline is the difference (ROLE-01). */
export function diffRoleAssignments<
  C extends RoleAssignmentRef,
  N extends RoleAssignmentRef,
>(current: readonly C[], next: readonly N[]) {
  const before = new Set(current.map(roleAssignmentKey));
  const after = new Set(next.map(roleAssignmentKey));
  const seen = new Set<string>();
  const added = next.filter((role) => {
    const key = roleAssignmentKey(role);
    if (before.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const removed = current.filter((role) => !after.has(roleAssignmentKey(role)));
  return { added, removed };
}
