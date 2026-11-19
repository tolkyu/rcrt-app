'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lazy, type ComponentProps } from 'react';
import { DeferredMenu, useDeferredMenu } from '@/components/ui/deferred-menu';
import type { VerticalOption } from '@/lib/vertical-filter';

const loadMenu = () => import('./vertical-switcher-menu');
const VerticalSwitcherMenu = lazy(loadMenu);

/** «Усі мої вертикалі ▾»: only the user's verticals; hidden with fewer than two (design-system §5). */
export function VerticalSwitcher({
  verticals,
  value,
  onChange,
}: {
  verticals: readonly VerticalOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('shell');
  const menu = useDeferredMenu(loadMenu);
  if (verticals.length < 2) return null;
  const selected = verticals.find((vertical) => vertical.id === value);
  const label = selected?.name ?? t('allVerticals');
  const trigger = (props: ComponentProps<'button'>) => (
    <button
      type="button"
      aria-label={t('verticalFilter', { name: label })}
      className="border-border bg-surface text-foreground hover:bg-surface-muted flex h-10 max-w-56 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
      {...props}
    >
      <span className="truncate">{label}</span>
      <ChevronDown
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden="true"
      />
    </button>
  );
  return (
    <DeferredMenu menu={menu} trigger={trigger}>
      {(openedBy, menuTrigger) => (
        <VerticalSwitcherMenu
          trigger={menuTrigger}
          openedBy={openedBy}
          verticals={verticals}
          value={value}
          onChange={onChange}
        />
      )}
    </DeferredMenu>
  );
}
