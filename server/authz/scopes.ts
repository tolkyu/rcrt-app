import { inArray, or, sql, type SQL } from 'drizzle-orm';
import { appUser, userRole, vertical } from '../db/schema';
import { NotFoundError } from '../http/errors';
import type { AuthContext } from './context';
import {
  PERMISSIONS,
  type PermissionsOn,
  type ReadPermissionOn,
} from './permissions';
import type {
  ResourceType,
  ScopeKind,
  Stage,
  UserId,
  VerticalId,
} from './types';

export interface ScopeArgs {
  readonly me: UserId;
  readonly verticalIds: readonly VerticalId[];
}
type ScopeBuilder<A> = (args: A) => SQL;

/** SQL predicate per vertical-bound scope kind for one resource; GLOBAL is always `true`. */
export interface ScopeAdapter<R extends ResourceType> {
  readonly resource: R;
  readonly VERTICAL?: ScopeBuilder<ScopeArgs>;
  readonly VERTICAL_FROM_STAGE?: ScopeBuilder<
    ScopeArgs & { readonly stage: Stage }
  >;
  readonly OWN?: ScopeBuilder<ScopeArgs>;
  readonly OWN_INITIATED_NEW?: ScopeBuilder<ScopeArgs>;
  readonly ASSIGNED?: ScopeBuilder<ScopeArgs>;
  readonly UNASSIGNED_OPEN?: ScopeBuilder<ScopeArgs>;
  readonly SUBMITTED_TO_ME?: ScopeBuilder<ScopeArgs>;
}

export const supportedScopes = (
  adapter: ScopeAdapter<ResourceType>,
): ScopeKind[] => [
  'GLOBAL',
  ...(
    [
      'VERTICAL',
      'VERTICAL_FROM_STAGE',
      'OWN',
      'OWN_INITIATED_NEW',
      'ASSIGNED',
      'UNASSIGNED_OPEN',
      'SUBMITTED_TO_ME',
    ] as const
  ).filter((kind) => adapter[kind] !== undefined),
];

/**
 * WHERE fragment for a list/detail query: `true` for GLOBAL, `false` without a grant,
 * otherwise the OR of one indexed predicate per grant (docs/authz-matrix.md §3).
 */
export function scopeWhere<R extends ResourceType>(
  ctx: AuthContext,
  permission: PermissionsOn<R>,
  adapter: ScopeAdapter<R>,
): SQL {
  const predicates: SQL[] = [];
  for (const grant of ctx.grants.get(permission) ?? []) {
    const { scope } = grant;
    if (scope.kind === 'GLOBAL') return sql`true`;
    if (grant.verticalIds === 'ALL' || grant.verticalIds.length === 0) continue;
    const args = { me: ctx.userId, verticalIds: grant.verticalIds };
    const predicate =
      scope.kind === 'VERTICAL_FROM_STAGE'
        ? adapter.VERTICAL_FROM_STAGE?.({ ...args, stage: scope.stage })
        : adapter[scope.kind]?.(args);
    if (!predicate) {
      throw new Error(
        `Scope ${scope.kind} has no SQL predicate for ${adapter.resource}`,
      );
    }
    predicates.push(predicate);
  }
  if (predicates.length === 0) return sql`false`;
  return predicates.length === 1 ? predicates[0]! : or(...predicates)!;
}

/**
 * Scoped single fetch: the scope is always computed from a read permission, so a write grant
 * wider than the read grant can never reveal an object (SEC-CORE-05). No row ⇒ 404.
 */
export async function findVisibleOrThrow<R extends ResourceType, T>(
  ctx: AuthContext,
  permission: ReadPermissionOn<R>,
  adapter: ScopeAdapter<R>,
  load: (scope: SQL) => Promise<T | null | undefined>,
): Promise<T> {
  if (PERMISSIONS[permission].write) {
    throw new Error(`${permission} cannot scope a detail fetch`);
  }
  const row = await load(scopeWhere(ctx, permission, adapter));
  if (row === null || row === undefined) throw new NotFoundError();
  return row;
}

export const verticalScope: ScopeAdapter<'vertical'> = {
  resource: 'vertical',
  VERTICAL: ({ verticalIds }) => inArray(vertical.id, [...verticalIds]),
};

/** Directory entries: users holding any role in one of the caller's verticals (user_role_user_idx). */
export const userDirectoryScope: ScopeAdapter<'user'> = {
  resource: 'user',
  VERTICAL: ({ verticalIds }) =>
    sql`exists (select 1 from ${userRole} where ${userRole.userId} = ${appUser.id} and ${inArray(userRole.verticalId, [...verticalIds])})`,
};

/** Users admin, role assignments, invites, TL priorities and audit are GLOBAL-only grants (§2.6). */
export const settingsScope: ScopeAdapter<'settings'> = { resource: 'settings' };
