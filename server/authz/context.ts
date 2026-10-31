import { PERMISSIONS, type PermissionCode } from './permissions';
import { BUILTIN_ROLES, MFA_REQUIRED_ROLES, type Grant } from './roles';
import type {
  BuiltinRole,
  RoleAssignment,
  RoleCode,
  Scope,
  UserId,
  VerticalId,
} from './types';

export type AuthAssurance = 'aal1' | 'aal2';

/** Grants with the same permission and scope are merged across assignments; different scopes never are (DG-10). */
export interface ResolvedGrant {
  readonly scope: Scope;
  readonly verticalIds: readonly VerticalId[] | 'ALL';
  readonly roles: readonly RoleCode[];
}

export interface AuthContext {
  readonly userId: UserId;
  readonly roles: readonly RoleAssignment[];
  readonly grants: ReadonlyMap<PermissionCode, readonly ResolvedGrant[]>;
  readonly aal: AuthAssurance;
  /** Holds ADMIN or FINANCE without an aal2 session: those grants are withheld until MFA (owner 2026-10-31). */
  readonly mfaRequired: boolean;
  readonly mfaWithheld: ReadonlySet<PermissionCode>;
  readonly timezone: string;
}

export type RoleDefinitions = Readonly<
  Partial<Record<RoleCode, readonly Grant[]>>
>;

const isBuiltin = (role: RoleCode): role is BuiltinRole =>
  Object.hasOwn(BUILTIN_ROLES, role);
const scopeKey = (permission: PermissionCode, scope: Scope) =>
  scope.kind === 'VERTICAL_FROM_STAGE'
    ? `${permission}|${scope.kind}|${scope.stage}`
    : `${permission}|${scope.kind}`;

interface Draft {
  permission: PermissionCode;
  scope: Scope;
  verticalIds: Set<VerticalId> | 'ALL';
  roles: Set<RoleCode>;
}

export function buildAuthContext(
  input: {
    readonly userId: UserId;
    readonly roles: readonly RoleAssignment[];
    readonly aal: AuthAssurance;
    readonly timezone: string;
  },
  definitions: RoleDefinitions = BUILTIN_ROLES,
): AuthContext {
  const drafts = new Map<string, Draft>();
  const withheld = new Set<PermissionCode>();
  let mfaRequired = false;

  for (const assignment of input.roles) {
    const grants = definitions[assignment.role] ?? [];
    const gated =
      isBuiltin(assignment.role) && MFA_REQUIRED_ROLES.has(assignment.role);
    if (gated && input.aal !== 'aal2') {
      mfaRequired = true;
      for (const { permission } of grants) withheld.add(permission);
      continue;
    }
    for (const { permission, scope } of grants) {
      const legal: readonly string[] = PERMISSIONS[permission].scopes;
      if (!legal.includes(scope.kind)) continue;
      const global = scope.kind === 'GLOBAL';
      // A global grant needs a global assignment and a vertical-bound grant a vertical one (D40).
      if (global !== (assignment.verticalId === null)) continue;
      const key = scopeKey(permission, scope);
      const draft = drafts.get(key) ?? {
        permission,
        scope,
        verticalIds: global ? 'ALL' : new Set<VerticalId>(),
        roles: new Set<RoleCode>(),
      };
      if (draft.verticalIds !== 'ALL' && assignment.verticalId) {
        draft.verticalIds.add(assignment.verticalId);
      }
      draft.roles.add(assignment.role);
      drafts.set(key, draft);
    }
  }

  const grants = new Map<PermissionCode, ResolvedGrant[]>();
  for (const draft of drafts.values()) {
    const list = grants.get(draft.permission) ?? [];
    list.push({
      scope: draft.scope,
      verticalIds:
        draft.verticalIds === 'ALL' ? 'ALL' : [...draft.verticalIds].sort(),
      roles: [...draft.roles].sort(),
    });
    grants.set(draft.permission, list);
  }
  for (const permission of grants.keys()) withheld.delete(permission);

  return {
    userId: input.userId,
    roles: input.roles,
    grants,
    aal: input.aal,
    mfaRequired,
    mfaWithheld: withheld,
    timezone: input.timezone,
  };
}
