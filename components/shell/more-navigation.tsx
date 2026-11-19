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
import { isActivePath, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useLogout } from './use-logout';

const slotClass =
  'active:bg-surface-muted flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium';

export function MoreNavigation({ items }: { items: readonly NavItem[] }) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const logout = useLogout();
  const moreActive = items.some((item) => isActivePath(pathname, item.href));
  return (
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
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium',
                    active
                      ? 'bg-primary-subtle text-link'
                      : 'text-foreground hover:bg-surface-muted active:bg-surface-muted',
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
              className="text-error-text hover:bg-destructive-subtle active:bg-destructive-subtle flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-base font-medium disabled:opacity-60"
            >
              <LogOut className="size-5" aria-hidden="true" />
              {logout.isPending ? t('loggingOut') : t('logout')}
            </button>
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}
