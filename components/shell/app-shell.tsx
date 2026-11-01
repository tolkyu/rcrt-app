'use client';

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { mobileNav, navItemsByIds, type NavItemId } from '@/lib/nav';
import { PREFERENCE_COOKIES, writePreference } from '@/lib/preference-cookie';
import { cn } from '@/lib/utils';
import type { VerticalOption } from '@/lib/vertical-filter';
import { BottomNav } from './bottom-nav';
import { BrandMark } from './brand';
import { Sidebar, SidebarNav } from './sidebar';
import { UserMenu } from './user-menu';
import { VerticalSwitcher } from './vertical-switcher';

export interface AppShellProps {
  readonly navIds: readonly NavItemId[];
  readonly verticals: readonly VerticalOption[];
  readonly verticalFilter: string;
  readonly initialCollapsed: boolean;
  readonly children: ReactNode;
}

/**
 * App frame (UI-04, wireframes/app-shell.md): ≥1024 sidebar 240 / rail 72, 768–1023 off-canvas sheet,
 * <768 compact top bar + bottom nav. Search and bell stay hidden until Phases 2 and 5 ship them (Q-42).
 */
export function AppShell({
  navIds,
  verticals,
  verticalFilter,
  initialCollapsed,
  children,
}: AppShellProps) {
  const t = useTranslations('shell');
  const tCommon = useTranslations('common');
  const items = useMemo(() => navItemsByIds(navIds), [navIds]);
  const mobile = useMemo(() => mobileNav(items), [items]);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [sheetOpen, setSheetOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writePreference(
      PREFERENCE_COOKIES.sidebar,
      next ? 'collapsed' : 'expanded',
    );
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-60 rounded-lg px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('skipToContent')}
      </a>
      <Sidebar items={items} collapsed={collapsed} />
      <div
        className={cn(
          'flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-18' : 'lg:pl-60',
        )}
      >
        <header className="border-border bg-surface sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3 md:h-16 md:gap-3 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden="true" />
            )}
          </Button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex lg:hidden"
                aria-label={t('openMenu')}
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" closeLabel={tCommon('close')}>
              <div className="flex h-16 shrink-0 items-center px-5">
                <SheetTitle className="sr-only">{t('menuTitle')}</SheetTitle>
                <BrandMark />
              </div>
              <div className="flex flex-1 flex-col px-4 pb-4">
                <SidebarNav
                  items={items}
                  onNavigate={() => setSheetOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Link
            href="/"
            aria-label={t('homeLink')}
            className="flex min-h-11 items-center rounded-md md:hidden"
          >
            <BrandMark />
          </Link>
          <div className="hidden md:block">
            <VerticalSwitcher
              verticals={verticals}
              initialValue={verticalFilter}
            />
          </div>
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            'mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 outline-none md:px-6 md:py-8',
            mobile && 'pb-28 md:pb-8',
          )}
        >
          {children}
        </main>
      </div>
      {mobile && <BottomNav nav={mobile} />}
    </div>
  );
}
