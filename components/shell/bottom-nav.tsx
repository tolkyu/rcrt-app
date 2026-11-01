'use client';

import { Ellipsis, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { isActivePath, type MobileNav } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useLogout } from './use-logout';

const slotClass =
  'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium';

/** Mobile bottom nav (A-46): bar sections + «Ще» sheet with the rest and «Вийти»; active = --link. */
export function BottomNav({ nav }: { nav: MobileNav }) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const logout = useLogout();
  const moreActive = nav.more.some((item) => isActivePath(pathname, item.href));
  return (
    <nav
      aria-label={t('mobileNav')}
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch gap-1 px-2 py-1.5">
        {nav.bar.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex flex-1">
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
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                className={cn(
                  slotClass,
                  moreActive ? 'text-link' : 'text-muted-foreground',
                )}
              >
                <Ellipsis className="size-5" aria-hidden="true" />
                <span>{t('more')}</span>
              </SheetTrigger>
              <SheetContent side="bottom" closeLabel={tCommon('close')}>
                <div className="bg-border mx-auto mt-2 h-1 w-10 rounded-full" />
                <div className="px-5 pt-2">
                  <SheetTitle>{t('moreTitle')}</SheetTitle>
                  <SheetDescription className="sr-only">
                    {t('moreDescription')}
                  </SheetDescription>
                </div>
                <ul className="flex flex-col gap-1 px-3 pb-4">
                  {nav.more.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium',
                            active
                              ? 'bg-primary-subtle text-link'
                              : 'text-foreground hover:bg-surface-muted',
                          )}
                        >
                          <Icon
                            className={cn(
                              'size-5',
                              active ? 'text-link' : 'text-muted-foreground',
                            )}
                            aria-hidden="true"
                          />
                          {tNav(item.id)}
                        </Link>
                      </li>
                    );
                  })}
                  <li className="border-border mt-1 border-t pt-2">
                    <button
                      type="button"
                      disabled={logout.isPending}
                      onClick={() => logout.mutate()}
                      className="text-error-text hover:bg-destructive-subtle flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-base font-medium disabled:opacity-60"
                    >
                      <LogOut className="size-5" aria-hidden="true" />
                      {logout.isPending ? t('loggingOut') : t('logout')}
                    </button>
                  </li>
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        )}
      </ul>
    </nav>
  );
}
