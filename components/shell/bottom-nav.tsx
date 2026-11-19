'use client';

import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { lazy, Suspense } from 'react';
import { isActivePath, type MobileNav } from '@/lib/nav';
import { cn } from '@/lib/utils';
const MoreNavigation = lazy(() =>
  import('./more-navigation').then((module) => ({
    default: module.MoreNavigation,
  })),
);

const slotClass =
  'active:bg-surface-muted flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium';

/** Mobile bottom nav (A-46): bar sections + «Ще» sheet with the rest and «Вийти»; active = --link. */
export function BottomNav({ nav }: { nav: MobileNav }) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('mobileNav')}
      data-bottom-nav=""
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 border-t pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
    >
      <ul className="flex h-16 items-stretch gap-1 px-2 py-1.5">
        {nav.bar.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  slotClass,
                  active ? 'text-link' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{tNav(item.id)}</span>
              </Link>
            </li>
          );
        })}
        {nav.more.length > 0 && (
          <li className="flex flex-1">
            <Suspense
              fallback={
                <span className={slotClass}>
                  <Ellipsis className="size-5" aria-hidden="true" />
                  <span>{t('more')}</span>
                </span>
              }
            >
              <MoreNavigation items={nav.more} />
            </Suspense>
          </li>
        )}
      </ul>
    </nav>
  );
}
