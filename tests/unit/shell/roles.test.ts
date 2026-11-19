import { describe, expect, it } from 'vitest';
import {
  ROLE_DISPLAY_ORDER,
  roleLabelKey,
  roleSummary,
  sortRoles,
  type RoleView,
} from '@/lib/roles';
import { BUILTIN_ROLES } from '@/server/authz/roles';

const gambling = { id: 'v-gambling', name: 'Гемблінг' };
const crypto = { id: 'v-crypto', name: 'Крипто' };
const eurozone = { id: 'v-euro', name: 'Єврозона' };
const role = (
  code: string,
  vertical: RoleView['vertical'] = null,
): RoleView => ({
  role: code,
  vertical,
});
const labels = (roles: readonly RoleView[]) =>
  roles.map((entry) => `${entry.role}:${entry.vertical?.name ?? '-'}`);

describe('sortRoles: widest role first, then vertical name in Ukrainian collation [D64]', () => {
  it('orders by role rank across every built-in role', () => {
    const shuffled = [...ROLE_DISPLAY_ORDER]
      .reverse()
      .map((code) => role(code));
    expect(sortRoles(shuffled).map((entry) => entry.role)).toEqual([
      ...ROLE_DISPLAY_ORDER,
    ]);
  });

  it('covers every built-in role exactly once', () => {
    expect([...ROLE_DISPLAY_ORDER].sort()).toEqual(
      Object.keys(BUILTIN_ROLES).sort(),
    );
  });

  it('breaks ties by vertical name with Ukrainian letters ordered correctly', () => {
    expect(
      labels(
        sortRoles([
          role('HR', crypto),
          role('HR', gambling),
          role('HR', eurozone),
          role('HEAD_HR', crypto),
        ]),
      ),
    ).toEqual(['HEAD_HR:Крипто', 'HR:Гемблінг', 'HR:Єврозона', 'HR:Крипто']);
  });

  it('puts custom roles after built-in ones and a global role before vertical ones of the same rank', () => {
    expect(
      labels(
        sortRoles([
          role('custom:sourcer', gambling),
          role('FINANCE'),
          role('RECRUITER', gambling),
          role('custom:analyst', null),
        ]),
      ),
    ).toEqual([
      'RECRUITER:Гемблінг',
      'FINANCE:-',
      'custom:analyst:-',
      'custom:sourcer:Гемблінг',
    ]);
  });

  it('does not mutate the input and keeps extra fields', () => {
    const input = [
      { ...role('TEAM_LEAD', gambling), priority: 1 },
      { ...role('ADMIN'), priority: 0 },
    ] as const;
    const sorted = sortRoles(input);
    expect(sorted.map((entry) => entry.priority)).toEqual([0, 1]);
    expect(input[0].role).toBe('TEAM_LEAD');
  });
});

describe('roleSummary and roleLabelKey: «Роль · Вертикаль +N» inputs', () => {
  it('returns null for no assignments', () => {
    expect(roleSummary([])).toBeNull();
  });

  it('picks the widest role as primary and counts the others', () => {
    expect(
      roleSummary([
        role('HR', crypto),
        role('HEAD_RECRUITER', gambling),
        role('HR', gambling),
      ]),
    ).toEqual({ primary: role('HEAD_RECRUITER', gambling), others: 2 });
    expect(roleSummary([role('TEAM_LEAD', gambling)])).toEqual({
      primary: role('TEAM_LEAD', gambling),
      others: 0,
    });
  });

  it.each<[string, string]>([
    ...ROLE_DISPLAY_ORDER.map((code): [string, string] => [code, code]),
    ['custom:sourcer', 'custom'],
    ['admin', 'custom'],
    ['', 'custom'],
  ])('%s → %s', (code, key) => {
    expect(roleLabelKey(code)).toBe(key);
  });
});
