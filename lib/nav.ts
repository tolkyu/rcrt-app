import { Settings, UserRound, type LucideIcon } from 'lucide-react';
import type { PermissionCode } from '@/server/authz/permissions';

export type NavItemId = 'profile' | 'settings';

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
}

const SETTINGS_PERMISSIONS: readonly PermissionCode[] = [
  'settings.users.manage',
  'settings.verticals.manage',
  'settings.priorities.manage',
  'audit.read',
];

/**
 * The single navigation config (UI-04, screens.md §1). Only sections that are built are listed (D28);
 * later phases add Головна, Вакансії, Кандидати, Календар (`bar`) and Статистика, Архів (`more`).
 */
export const NAV_ITEMS: readonly NavItem[] = [
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
    anyOf: SETTINGS_PERMISSIONS,
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

/** Landing after sign-in and for `/`: the first main section, else the first footer section. */
export function landingPath(items: readonly NavItem[]): string {
  const target =
    items.find((item) => item.zone === 'main') ?? items.find(() => true);
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
  const bar = items.filter((item) => item.mobile === 'bar');
  return {
    bar: bar.slice(0, BAR_SLOTS),
    more: [
      ...bar.slice(BAR_SLOTS),
      ...items.filter((item) => item.mobile === 'more'),
    ],
  };
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
