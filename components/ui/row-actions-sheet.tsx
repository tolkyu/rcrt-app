'use client';

import { Ellipsis, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import type { RowAction } from './row-actions-menu';
import { Sheet, SheetContent, SheetTitle } from './sheet';

const itemClass =
  'hover:bg-surface-muted active:bg-surface-muted flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base font-medium disabled:opacity-60';

/** Phone version of `RowActionsMenu`: an icon button opens a bottom sheet with 48 px items, destructive ones red and after a divider (wireframe §2). */
export function RowActionsSheet({
  label,
  title,
  actions,
}: {
  /** Name of the trigger. */
  label: string;
  /** Heading of the sheet: what the actions act on. */
  title: string;
  actions: readonly RowAction[];
}) {
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const change = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
  };
  if (!actions.length) return null;
  const select = (action: RowAction) => {
    let kept = false;
    action.onSelect({
      keepOpen: () => {
        kept = true;
      },
      close: () => change(false),
      isOpen: () => openRef.current,
    });
    if (!kept) change(false);
  };
  const item = (action: RowAction, separated = false) => (
    <li
      key={action.id}
      className={separated ? 'border-border mt-1 border-t pt-2' : undefined}
    >
      <button
        type="button"
        disabled={Boolean(action.disabledReason)}
        aria-busy={action.pending || undefined}
        onClick={() => select(action)}
        className={cn(
          itemClass,
          action.destructive
            ? 'text-error-text hover:bg-destructive-subtle active:bg-destructive-subtle'
            : 'text-foreground',
          action.disabledReason &&
            'flex-col items-start justify-center gap-0.5',
        )}
      >
        <span>{action.label}</span>
        {action.disabledReason && (
          <span className="text-muted-foreground text-xs font-normal">
            {action.disabledReason}
          </span>
        )}
        {action.pending && (
          <span aria-hidden="true" className="skeleton-delayed ml-auto">
            <LoaderCircle className="animate-[spin_600ms_linear_infinite]" />
          </span>
        )}
      </button>
    </li>
  );
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-slot="row-actions-trigger"
        className="size-11 shrink-0"
        onClick={() => change(true)}
      >
        <Ellipsis aria-hidden="true" />
      </Button>
      <Sheet open={open} onOpenChange={change}>
        <SheetContent
          side="bottom"
          closeLabel={tCommon('close')}
          aria-describedby={undefined}
        >
          <div className="bg-border mx-auto mt-2 h-1 w-10 shrink-0 rounded-full" />
          <SheetTitle className="text-foreground truncate px-5 pt-1 pr-14 text-base font-semibold">
            {title}
          </SheetTitle>
          <ul className="flex flex-col gap-1 px-3 pb-2">
            {safe.map((action) => item(action))}
            {destructive.map((action, index) =>
              item(action, index === 0 && safe.length > 0),
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
