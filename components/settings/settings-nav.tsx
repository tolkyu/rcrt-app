'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isActivePath } from '@/lib/active-path';
import { cn } from '@/lib/utils';

/** Settings sub-menu: 220 px column on desktop, horizontal scroller on mobile (wireframe settings-admin §0). */
export function SettingsNav({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const list = useRef<HTMLUListElement>(null);
  /** On the mobile scroller the active section may start off-screen (e.g. «Пріоритети тімлідів»). */
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);
  return (
    <nav aria-label={label} className="md:w-55 md:shrink-0">
      <ul ref={list} className="flex gap-1 overflow-x-auto md:flex-col">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-120 md:min-h-10 md:whitespace-normal',
                  active
                    ? 'bg-primary-subtle text-link'
                    : 'text-foreground hover:bg-surface-muted',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
