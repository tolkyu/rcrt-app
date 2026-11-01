import { describe, expect, it } from 'vitest';
import { can, canActOn } from '@/server/authz/can';
import type { AuthContext } from '@/server/authz/context';
import {
  PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
} from '@/server/authz/permissions';
import { BUILTIN_ROLES } from '@/server/authz/roles';
import type { BuiltinRole, ResourceRef, Scope } from '@/server/authz/types';
import { fixture, ROLE_COLUMNS, roleContext, scopeCases } from './fixtures';
import { MATRIX } from './matrix-table';

interface Row {
  readonly id: string;
  readonly permission: PermissionCode;
  readonly cells: Readonly<Record<BuiltinRole, string>>;
}

const rows: Row[] = MATRIX.trim()
  .split('\n')
  .map((line) => {
    const [id, permission, ...cells] = line
      .split(' | ')
      .map((part) => part.trim());
    return {
      id: id!,
      permission: permission as PermissionCode,
      cells: Object.fromEntries(
        ROLE_COLUMNS.map((role, index) => [role, cells[index]!]),
      ) as Record<BuiltinRole, string>,
    };
  });

const deniedTokens = new Set(['403', '404', 'absent']);
const fieldPermissions = new Set<PermissionCode>([
  'candidate.contacts.read',
  'offer.salary.read',
]);

/** The permission whose visibility decides 403 (visible, action denied) vs 404 (hidden) — test-plan §3.1. */
function baseRead(permission: PermissionCode): PermissionCode {
  if (permission === 'candidate.purge' || permission === 'archive.restore')
    return 'archive.deleted.read';
  if (permission === 'polygraph.file.read') return permission;
  if (permission.startsWith('bonus.payout_report.'))
    return 'bonus.payout_report.read';
  if (permission.startsWith('bonus.')) return 'bonus.read';
  if (permission.startsWith('vacancy.') || permission === 'position.manage')
    return 'vacancy.read';
  if (permission.startsWith('candidate.') || permission === 'comment.create')
    return 'candidate.read';
  if (/^(application|polygraph|offer|probation)\./.test(permission))
    return 'application.read';
  return permission;
}

function scopeToken(scopes: readonly Scope[]): string {
  const kinds = scopes.map((scope) => scope.kind).sort();
  if (kinds.join() === 'ASSIGNED,UNASSIGNED_OPEN') return 'asg+uo';
  if (kinds.length !== 1) return kinds.join('+');
  const [scope] = scopes;
  switch (scope!.kind) {
    case 'GLOBAL':
      return 'G';
    case 'VERTICAL':
      return 'V';
    case 'VERTICAL_FROM_STAGE':
      return scope!.stage === 'POLYGRAPH' ? 'V≥P' : `V≥${scope!.stage}`;
    case 'OWN':
      return 'own';
    case 'OWN_INITIATED_NEW':
      return 'ownN';
    case 'UNASSIGNED_OPEN':
      return 'uo';
    case 'SUBMITTED_TO_ME':
      return 'sub';
    default:
      return scope!.kind;
  }
}

/** Self-benefit permissions are checked through canActOn; fixtures never make ME a beneficiary there. */
const check = (
  ctx: AuthContext,
  permission: PermissionCode,
  resource: ResourceRef,
) =>
  PERMISSIONS[permission].selfBenefit
    ? canActOn(ctx, permission as 'bonus.approve', resource as never, [])
    : can(ctx, permission as 'vacancy.read', resource as never);

const resourceOf = (permission: PermissionCode) =>
  PERMISSIONS[permission].resources[0];

describe('Authorization matrix: built-in role map equals docs/authz-matrix.md [ROLE-04, VIS-03]', () => {
  it('covers exactly the permission catalog', () => {
    expect(rows.map((row) => row.permission).sort()).toEqual(
      [...PERMISSION_CODES].sort(),
    );
  });

  it.each(
    rows.flatMap((row) =>
      ROLE_COLUMNS.map((role) => [row.id, row.permission, role] as const),
    ),
  )('%s %s × %s: grants match the matrix cell', (_id, permission, role) => {
    const row = rows.find((candidate) => candidate.permission === permission)!;
    const scopes = BUILTIN_ROLES[role]
      .filter((grant) => grant.permission === permission)
      .map((g) => g.scope);
    const expected = row.cells[role];
    expect(scopes.length === 0 ? 'none' : scopeToken(scopes)).toBe(
      deniedTokens.has(expected) ? 'none' : expected,
    );
  });
});

const grantedCells = rows.flatMap((row) =>
  ROLE_COLUMNS.filter((role) => !deniedTokens.has(row.cells[role])).map(
    (role) => [row.id, row.permission, role, row.cells[role]] as const,
  ),
);
const deniedCells = rows.flatMap((row) =>
  ROLE_COLUMNS.filter((role) => deniedTokens.has(row.cells[role])).map(
    (role) => [row.id, row.permission, role, row.cells[role]] as const,
  ),
);

describe('Authorization matrix: allowed and denied per granted cell [VIS-03]', () => {
  it.each(grantedCells)('%s %s × %s (%s)', (_id, permission, role, token) => {
    const type = resourceOf(permission);
    if (token === 'G') {
      const allowed =
        type === 'settings'
          ? fixture(type, 'base')
          : fixture(type, 'other_vertical');
      expect(check(roleContext(role), permission, allowed)).toBe(true);
      // Global roles are ADMIN/FINANCE: without aal2 their grants are withheld (MFA-02/03).
      expect(check(roleContext(role, 'aal1'), permission, allowed)).toBe(false);
      return;
    }
    const ctx = roleContext(role);
    const { allowed, denied } = scopeCases(type, token);
    for (const resource of allowed)
      expect(check(ctx, permission, resource), JSON.stringify(resource)).toBe(
        true,
      );
    for (const resource of denied)
      expect(check(ctx, permission, resource), JSON.stringify(resource)).toBe(
        false,
      );
  });
});

describe('Authorization matrix: empty cells are denied with the documented status [VIS-03]', () => {
  it.each(deniedCells)('%s %s × %s → %s', (_id, permission, role, expected) => {
    const ctx = roleContext(role);
    expect(
      check(ctx, permission, fixture(resourceOf(permission), 'max_visible')),
    ).toBe(false);
    const base = baseRead(permission);
    const visible = check(ctx, base, fixture(resourceOf(base), 'max_visible'));
    const status = visible
      ? fieldPermissions.has(permission)
        ? 'absent'
        : '403'
      : '404';
    expect(status).toBe(expected);
  });
});
