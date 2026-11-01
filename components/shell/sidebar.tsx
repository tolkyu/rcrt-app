'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { isActivePath, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand';

const TOOLTIP_DELAY_MS = 300;

/**
 * Icon-rail label without a tooltip runtime (PERF-04): shown on focus or after a hover delay, dismissed
 * with Escape and hoverable, as WCAG 1.4.13 requires; it sits beside the link so the link name stays single.
 */
function useRailTooltip() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  return {
    id,
    open,
    wrapper: {
      onPointerEnter: () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(true), TOOLTIP_DELAY_MS);
      },
      onPointerLeave: hide,
    },
    trigger: {
      onFocus: () => setOpen(true),
      onBlur: hide,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') hide();
      },
      'aria-describedby': open ? id : undefined,
    },
  };
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const tooltip = useRailTooltip();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      {...(collapsed ? tooltip.trigger : {})}
      className={cn(
        'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-120 lg:h-10',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-primary-subtle text-link'
          : 'text-foreground hover:bg-surface-muted',
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0',
          active ? 'text-link' : 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{t(item.id)}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <div className="relative" {...tooltip.wrapper}>
      {link}
      {tooltip.open && (
        <span
          role="tooltip"
          id={tooltip.id}
          className="border-border bg-tooltip text-tooltip-foreground animate-in fade-in-0 absolute top-1/2 left-full z-30 ml-2 -translate-y-1/2 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
        >
          {t(item.id)}
        </span>
      )}
    </div>
  );
}

/** Sidebar body shared by the desktop rail and the tablet sheet: brand, main sections, pinned footer. */
export function SidebarNav({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: readonly NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('shell');
  const main = items.filter((item) => item.zone === 'main');
  const footer = items.filter((item) => item.zone === 'footer');
  return (
    <nav aria-label={t('mainNav')} className="flex min-h-0 flex-1 flex-col">
      <ul className="flex flex-col gap-1">
        {main.map((item) => (
          <li key={item.id}>
            <NavLink
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
      {footer.length > 0 && (
        <ul className="mt-auto flex flex-col gap-1 pt-4">
          {footer.map((item) => (
            <li key={item.id}>
              <NavLink
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

export function Sidebar({
  items,
  collapsed,
}: {
  items: readonly NavItem[];
  collapsed: boolean;
}) {
  const t = useTranslations('shell');
  return (
    <aside
      className={cn(
        'border-border bg-surface fixed inset-y-0 left-0 z-20 hidden flex-col border-r transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-18' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center',
          collapsed ? 'justify-center' : 'px-5',
        )}
      >
        <Link href="/" aria-label={t('homeLink')} className="rounded-md">
          <BrandMark withWordmark={!collapsed} />
        </Link>
      </div>
      <div
        className={cn('flex flex-1 flex-col pb-4', collapsed ? 'px-3' : 'px-4')}
      >
        <SidebarNav items={items} collapsed={collapsed} />
      </div>
    </aside>
  );
}
