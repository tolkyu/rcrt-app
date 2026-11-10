'use client';

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { mobileNav, navItemsByIds, type NavItemId } from '@/lib/nav';
import { PREFERENCE_COOKIES, writePreference } from '@/lib/preference-cookie';
import { cn } from '@/lib/utils';
import type { VerticalOption } from '@/lib/vertical-filter';
import { ApiError } from '@/lib/api-client';
import { BottomNav } from './bottom-nav';
import { BrandMark } from './brand';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';
import { VacanciesVerticalSwitcher } from './vacancies-vertical-switcher';
import { VerticalSwitcher } from './vertical-switcher';

const loadTabletMenu = () => import('./tablet-menu');
const TabletMenu = lazy(() =>
  loadTabletMenu().then((module) => ({ default: module.TabletMenu })),
);

const MfaRecovery = lazy(() =>
  import('../settings/mfa-recovery').then((module) => ({
    default: module.MfaRecovery,
  })),
);

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
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const items = useMemo(() => navItemsByIds(navIds), [navIds]);
  const mobile = useMemo(() => mobileNav(items), [items]);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [vertical, setVertical] = useState(verticalFilter);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [mfaAt, setMfaAt] = useState<{
    pathname: string;
    next: string;
    submittedAt: number;
  } | null>(null);
  if (mfaAt && mfaAt.pathname !== pathname) setMfaAt(null);
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated') return;
        const current = window.location.pathname;
        if (current !== '/settings' && !current.startsWith('/settings/'))
          return;
        if (event.action.type === 'success') setMfaAt(null);
        const error = event.mutation.state.error;
        if (
          event.action.type === 'error' &&
          error instanceof ApiError &&
          error.code === 'MFA_REQUIRED'
        ) {
          setMfaAt({
            pathname: current,
            next: current + window.location.search,
            submittedAt: event.mutation.state.submittedAt,
          });
        }
      }),
    [queryClient],
  );

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writePreference(
      PREFERENCE_COOKIES.sidebar,
      next ? 'collapsed' : 'expanded',
    );
  };

  const changeVertical = (next: string) => {
    setVertical(next);
    writePreference(PREFERENCE_COOKIES.vertical, next);
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
          'flex min-h-dvh min-w-0 flex-col',
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
          <Button
            ref={menuTrigger}
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex lg:hidden"
            aria-label={t('openMenu')}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onPointerEnter={() => void loadTabletMenu().catch(() => undefined)}
            onFocus={() => void loadTabletMenu().catch(() => undefined)}
            onClick={() => setSheetOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          {sheetOpen && (
            <Suspense fallback={null}>
              <TabletMenu
                items={items}
                onClose={() => setSheetOpen(false)}
                onFocusTrigger={() => menuTrigger.current?.focus()}
              />
            </Suspense>
          )}
          <Link
            href="/"
            aria-label={t('homeLink')}
            className="flex min-h-11 items-center rounded-md md:hidden"
          >
            <BrandMark />
          </Link>
          {verticals.length > 0 && pathname === '/' && (
            <div className="hidden md:block">
              <VerticalSwitcher
                verticals={verticals}
                value={vertical}
                onChange={changeVertical}
              />
            </div>
          )}
          {verticals.length > 0 && pathname === '/vacancies' && (
            <div className="hidden md:block">
              <Suspense fallback={null}>
                <VacanciesVerticalSwitcher
                  verticals={verticals}
                  onChange={changeVertical}
                />
              </Suspense>
            </div>
          )}
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
          {mfaAt && (
            <Suspense fallback={null}>
              <MfaRecovery key={mfaAt.submittedAt} next={mfaAt.next} />
            </Suspense>
          )}
          {children}
        </main>
      </div>
      {mobile && <BottomNav nav={mobile} />}
    </div>
  );
}
