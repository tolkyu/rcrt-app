import { UserRound } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  isActivePath,
  landingPath,
  mobileNav,
  NAV_ITEMS,
  navItemsByIds,
  visibleNavItems,
  type NavItem,
  type NavItemId,
} from '@/lib/nav';
import type { PermissionCode } from '@/server/authz/permissions';
import type { BuiltinRole, RoleAssignment } from '@/server/authz/types';
import { contextFor, CRYPTO, GAMBLING, roleContext } from '../authz/fixtures';

const item = (
  href: string,
  overrides: Partial<Omit<NavItem, 'href'>> = {},
): NavItem => ({
  id: 'profile' as NavItemId,
  href,
  icon: UserRound,
  zone: 'main',
  mobile: 'bar',
  anyOf: null,
  ...overrides,
});
const hrefs = (items: readonly NavItem[]) => items.map((entry) => entry.href);

const home = item('/');
const vacancies = item('/vacancies', { anyOf: ['vacancy.read'] });
const candidates = item('/candidates', { anyOf: ['candidate.read'] });
const statistics = item('/statistics', {
  mobile: 'more',
  anyOf: [
    'statistics.funnel.read',
    'statistics.hr.read',
    'statistics.bonus.read',
  ],
});
const archive = item('/archive', {
  mobile: 'more',
  anyOf: ['archive.deleted.read'],
});
const settings = item('/settings', {
  zone: 'footer',
  mobile: 'more',
  anyOf: ['settings.users.manage', 'settings.verticals.manage'],
});
const catalog = [home, vacancies, candidates, statistics, archive, settings];

const permissionsOf = (ctx: ReturnType<typeof contextFor>) =>
  new Set<string>(ctx.grants.keys());

describe('visibleNavItems: sections follow permission codes, never role names [UI-04, ROLE-04]', () => {
  it.each<[string, BuiltinRole, 'aal1' | 'aal2', readonly string[]]>([
    ['Admin with aal2 sees every section', 'ADMIN', 'aal2', hrefs(catalog)],
    ['Admin with aal1 has every ADMIN grant withheld', 'ADMIN', 'aal1', ['/']],
    [
      'Head Recruiter',
      'HEAD_RECRUITER',
      'aal1',
      ['/', '/vacancies', '/candidates', '/statistics', '/archive'],
    ],
    [
      'Recruiter',
      'RECRUITER',
      'aal1',
      ['/', '/vacancies', '/candidates', '/statistics'],
    ],
    [
      'Head HR',
      'HEAD_HR',
      'aal1',
      ['/', '/vacancies', '/candidates', '/statistics'],
    ],
    ['HR', 'HR', 'aal1', ['/', '/vacancies', '/candidates', '/statistics']],
    [
      'Team Lead',
      'TEAM_LEAD',
      'aal1',
      ['/', '/vacancies', '/candidates', '/statistics'],
    ],
    [
      'Finance with aal2 sees only Statistics',
      'FINANCE',
      'aal2',
      ['/', '/statistics'],
    ],
    [
      'Finance with aal1 has its global grants withheld',
      'FINANCE',
      'aal1',
      ['/'],
    ],
  ])('%s', (_case, role, aal, expected) => {
    expect(
      hrefs(visibleNavItems(permissionsOf(roleContext(role, aal)), catalog)),
    ).toEqual(expected);
  });

  it.each<
    [string, readonly RoleAssignment[], 'aal1' | 'aal2', readonly string[]]
  >([
    [
      'Finance + Team Lead unions statistics with pipeline sections',
      [
        { role: 'FINANCE', verticalId: null },
        { role: 'TEAM_LEAD', verticalId: GAMBLING },
      ],
      'aal2',
      ['/', '/vacancies', '/candidates', '/statistics'],
    ],
    [
      'Recruiter in one vertical + Head Recruiter in another adds Archive',
      [
        { role: 'RECRUITER', verticalId: CRYPTO },
        { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
      ],
      'aal1',
      ['/', '/vacancies', '/candidates', '/statistics', '/archive'],
    ],
    [
      'aal1 Admin + Recruiter keeps the Recruiter sections without Settings',
      [
        { role: 'ADMIN', verticalId: null },
        { role: 'RECRUITER', verticalId: GAMBLING },
      ],
      'aal1',
      ['/', '/vacancies', '/candidates', '/statistics'],
    ],
    ['no role assignments', [], 'aal2', ['/']],
  ])('multi-role: %s', (_case, roles, aal, expected) => {
    expect(
      hrefs(visibleNavItems(permissionsOf(contextFor(roles, aal)), catalog)),
    ).toEqual(expected);
  });

  it('a section is visible when any one of its permissions is held and keeps catalog order', () => {
    const only = (...codes: PermissionCode[]) =>
      hrefs(visibleNavItems(new Set(codes), catalog));
    expect(only('statistics.hr.read')).toEqual(['/', '/statistics']);
    expect(only('settings.verticals.manage', 'vacancy.read')).toEqual([
      '/',
      '/vacancies',
      '/settings',
    ]);
    expect(only('audit.read')).toEqual(['/']);
  });

  it('defaults to NAV_ITEMS: Profile is open to every signed-in user, Settings is not listed before T6 [D28]', () => {
    expect(visibleNavItems(new Set()).map((entry) => entry.id)).toEqual([
      'profile',
    ]);
    expect(
      visibleNavItems(permissionsOf(roleContext('ADMIN', 'aal2'))).map(
        (entry) => entry.href,
      ),
    ).toEqual(['/profile']);
    expect(NAV_ITEMS.map((entry) => entry.href)).not.toContain('/settings');
  });
});

describe('navItemsByIds: the client shell rebuilds items from server-filtered ids', () => {
  it('returns items for known ids and ignores the rest', () => {
    expect(navItemsByIds(['profile'])).toEqual([NAV_ITEMS[0]]);
    expect(navItemsByIds([])).toEqual([]);
    expect(navItemsByIds(['profile'], [vacancies])).toEqual([vacancies]);
  });
});

describe('landingPath: first main section, else first footer section, else Profile', () => {
  it.each<[string, readonly NavItem[], string]>([
    ['main sections lead', [settings, vacancies, candidates], '/vacancies'],
    ['footer only', [settings], '/settings'],
    ['nothing visible', [], '/profile'],
    ['current config', NAV_ITEMS, '/profile'],
  ])('%s', (_case, items, expected) => {
    expect(landingPath(items)).toBe(expected);
  });
});

describe('mobileNav: up to 4 bar slots + «Ще» (screens.md §1, A-46)', () => {
  it('is hidden when fewer than two sections exist', () => {
    expect(mobileNav([])).toBeNull();
    expect(mobileNav([vacancies])).toBeNull();
    expect(mobileNav(NAV_ITEMS)).toBeNull();
  });

  it('puts bar sections in slots and more sections in the sheet', () => {
    expect(mobileNav([home, statistics, vacancies, settings])).toEqual({
      bar: [home, vacancies],
      more: [statistics, settings],
    });
  });

  it('keeps exactly four bar sections in the bar', () => {
    const bar = [home, vacancies, candidates, item('/calendar')];
    expect(mobileNav(bar)).toEqual({ bar, more: [] });
  });

  it('overflows the fifth and later bar sections into «Ще» ahead of more-only sections', () => {
    const calendar = item('/calendar');
    const fifth = item('/fifth');
    const sixth = item('/sixth');
    const nav = mobileNav([
      home,
      archive,
      vacancies,
      candidates,
      calendar,
      fifth,
      settings,
      sixth,
    ]);
    expect(hrefs(nav!.bar)).toEqual([
      '/',
      '/vacancies',
      '/candidates',
      '/calendar',
    ]);
    expect(hrefs(nav!.more)).toEqual([
      '/fifth',
      '/sixth',
      '/archive',
      '/settings',
    ]);
  });

  it('works with only more sections: no bar slots, everything under «Ще»', () => {
    expect(mobileNav([statistics, settings])).toEqual({
      bar: [],
      more: [statistics, settings],
    });
  });
});

describe('isActivePath: exact match or nested route', () => {
  it.each<[string, string, boolean]>([
    ['/profile', '/profile', true],
    ['/profile/sessions', '/profile', true],
    ['/profiles', '/profile', false],
    ['/', '/profile', false],
    ['/vacancies/123/candidates', '/vacancies', true],
    ['/vacancies-archive', '/vacancies', false],
  ])('%s under %s → %s', (pathname, href, expected) => {
    expect(isActivePath(pathname, href)).toBe(expected);
  });
});
