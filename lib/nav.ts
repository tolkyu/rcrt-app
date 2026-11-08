import {
  BriefcaseBusiness,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionCode } from '@/server/authz/permissions';

export type NavItemId = 'vacancies' | 'profile' | 'settings';

export interface NavItem {
  readonly id: NavItemId;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Sidebar zone: `footer` is pinned to the bottom (Налаштування). */
  readonly zone: 'main' | 'footer';
  /** Mobile: `bar` takes a bottom-nav slot, `more` goes to the «Ще» sheet (screens.md §1). */
  readonly mobile: 'bar' | 'more';
  /** Visible when the user holds any of these permissions; `null` = every signed-in user. */
  readonly anyOf: readonly PermissionCode[] | null;
  /** Lower wins the landing after sign-in (UI-04-1); items without a rank only act as the fallback. */
  readonly landingRank?: number;
}

export type SettingsSectionId = 'users' | 'verticals' | 'priorities' | 'audit';

/** «Налаштування» sub-sections in display order; only built ones are listed (D28). */
export const SETTINGS_SECTIONS: readonly {
  readonly id: SettingsSectionId;
  readonly href: string;
  readonly permission: PermissionCode;
}[] = [
  {
    id: 'users',
    href: '/settings/users',
    permission: 'settings.users.manage',
  },
  {
    id: 'verticals',
    href: '/settings/verticals',
    permission: 'settings.verticals.manage',
  },
  {
    id: 'priorities',
    href: '/settings/priorities',
    permission: 'settings.priorities.manage',
  },
  { id: 'audit', href: '/settings/audit', permission: 'audit.read' },
];

export function visibleSettingsSections(permissions: ReadonlySet<string>) {
  return SETTINGS_SECTIONS.filter((section) =>
    permissions.has(section.permission),
  );
}

/**
 * The single navigation config (UI-04, screens.md §1). Only sections that are built are listed (D28);
 * later phases add Головна, Кандидати, Календар (`bar`) and Статистика, Архів (`more`).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'vacancies',
    href: '/vacancies',
    icon: BriefcaseBusiness,
    zone: 'main',
    mobile: 'bar',
    anyOf: ['vacancy.read'],
  },
  {
    id: 'profile',
    href: '/profile',
    icon: UserRound,
    zone: 'main',
    mobile: 'more',
    anyOf: null,
  },
  {
    id: 'settings',
    href: '/settings',
    icon: Settings,
    zone: 'footer',
    mobile: 'more',
    anyOf: SETTINGS_SECTIONS.map((section) => section.permission),
    landingRank: 1,
  },
];

export function visibleNavItems(
  permissions: ReadonlySet<string>,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  return items.filter(
    (item) =>
      item.anyOf === null ||
      item.anyOf.some((permission) => permissions.has(permission)),
  );
}

export function navItemsByIds(
  ids: readonly NavItemId[],
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  return items.filter((item) => ids.includes(item.id));
}

/** Landing after sign-in and for `/`: the best-ranked section, else the first main, else the first footer one. */
export function landingPath(items: readonly NavItem[]): string {
  const ranked = items
    .filter((item) => item.landingRank !== undefined)
    .sort((a, b) => a.landingRank! - b.landingRank!);
  const target =
    ranked[0] ??
    items.find((item) => item.zone === 'main') ??
    items.find(() => true);
  return target?.href ?? '/profile';
}

export interface MobileNav {
  readonly bar: NavItem[];
  readonly more: NavItem[];
}

const BAR_SLOTS = 4;

/** Bottom nav = up to 4 bar sections + «Ще»; hidden when there is only one section to go to. */
export function mobileNav(items: readonly NavItem[]): MobileNav | null {
  if (items.length < 2) return null;
  if (items.length <= BAR_SLOTS) return { bar: [...items], more: [] };
  const bar = items.filter((item) => item.mobile === 'bar');
  return {
    bar: bar.slice(0, BAR_SLOTS),
    more: [
      ...bar.slice(BAR_SLOTS),
      ...items.filter((item) => item.mobile === 'more'),
    ],
  };
}

export { isActivePath } from './active-path';
