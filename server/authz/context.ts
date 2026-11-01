import { PERMISSIONS, type PermissionCode } from './permissions';
import { BUILTIN_ROLES, GLOBAL_ROLES, type Grant } from './roles';
import {
  isRoleCode,
  type BuiltinRole,
  type RoleCode,
  type Scope,
  type UserId,
  type VerticalId,
} from './types';

export type AuthAssurance = 'aal1' | 'aal2';

/** Grants with the same permission and scope are merged across assignments; different scopes never are (DG-10). */
export interface ResolvedGrant {
  readonly scope: Scope;
  readonly verticalIds: readonly VerticalId[] | 'ALL';
}

/** Decisions use grants only; raw role assignments are deliberately absent (SEC-CORE-08). */
export interface AuthContext {
  readonly userId: UserId;
  readonly grants: ReadonlyMap<PermissionCode, readonly ResolvedGrant[]>;
  readonly aal: AuthAssurance;
  /** Some grants are withheld until the session reaches aal2 (owner 2026-10-31, SEC-CORE-09). */
  readonly mfaRequired: boolean;
  readonly mfaWithheld: ReadonlySet<PermissionCode>;
  readonly timezone: string;
}

export type RoleDefinitions = Readonly<
  Partial<Record<RoleCode, readonly Grant[]>>
>;

/** Assignment as stored; the role code is validated here rather than trusted. */
export interface StoredAssignment {
  readonly role: string;
  readonly verticalId: string | null;
}

const scopeKey = (permission: PermissionCode, scope: Scope) =>
  scope.kind === 'VERTICAL_FROM_STAGE'
    ? `${permission}|${scope.kind}|${scope.stage}`
    : `${permission}|${scope.kind}`;

/** Any global grant and every MFA-flagged permission need aal2, whichever role produced it. */
const needsAal2 = (permission: PermissionCode, scope: Scope) =>
  scope.kind === 'GLOBAL' || PERMISSIONS[permission].mfa;

const isGlobalRole = (role: RoleCode) => GLOBAL_ROLES.has(role as BuiltinRole);

interface Draft {
  permission: PermissionCode;
  scope: Scope;
  verticalIds: Set<VerticalId> | 'ALL';
}

export function buildAuthContext(
  input: {
    readonly userId: UserId;
    readonly roles: readonly StoredAssignment[];
    readonly aal: AuthAssurance;
    readonly timezone: string;
  },
  definitions: RoleDefinitions = BUILTIN_ROLES,
): AuthContext {
  const drafts = new Map<string, Draft>();
  const withheld = new Set<PermissionCode>();
  let mfaRequired = false;

  for (const assignment of input.roles) {
    const { role } = assignment;
    if (!isRoleCode(role) || !Object.hasOwn(definitions, role)) continue;
    // Only ADMIN and FINANCE may be global (D40); a global custom role is ignored (SEC-CORE-09).
    if (isGlobalRole(role) !== (assignment.verticalId === null)) continue;
    const verticalId = assignment.verticalId as VerticalId | null;
    for (const { permission, scope } of definitions[role] ?? []) {
      const legal: readonly string[] = PERMISSIONS[permission].scopes;
      if (!legal.includes(scope.kind)) continue;
      const global = scope.kind === 'GLOBAL';
      if (global !== (verticalId === null)) continue;
      if (needsAal2(permission, scope) && input.aal !== 'aal2') {
        mfaRequired = true;
        withheld.add(permission);
        continue;
      }
      const key = scopeKey(permission, scope);
      const draft = drafts.get(key) ?? {
        permission,
        scope,
        verticalIds: global ? 'ALL' : new Set<VerticalId>(),
      };
      if (draft.verticalIds !== 'ALL' && verticalId) {
        draft.verticalIds.add(verticalId);
      }
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
    });
    grants.set(draft.permission, list);
  }
  for (const permission of grants.keys()) withheld.delete(permission);

  return {
    userId: input.userId,
    grants,
    aal: input.aal,
    mfaRequired,
    mfaWithheld: withheld,
    timezone: input.timezone,
  };
}

/** Whether this user must use TOTP: some grant they hold or are denied needs aal2 (permission-based, SEC-CORE-09). */
export function requiresMfa(ctx: AuthContext): boolean {
  if (ctx.mfaWithheld.size > 0) return true;
  for (const [permission, grants] of ctx.grants) {
    if (grants.some((grant) => needsAal2(permission, grant.scope))) return true;
  }
  return false;
}
