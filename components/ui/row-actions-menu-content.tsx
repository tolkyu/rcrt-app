'use client';

import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { menuAutoFocus, type MenuOpenedBy } from './deferred-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import type { RowAction } from './row-actions-menu';

function ActionItem({
  action,
  close,
  isOpen,
}: {
  action: RowAction;
  close: () => void;
  isOpen: () => boolean;
}) {
  const reason = action.disabledReason;
  return (
    <DropdownMenuItem
      variant={action.destructive ? 'destructive' : 'default'}
      disabled={Boolean(reason)}
      aria-busy={action.pending || undefined}
      onSelect={(event) =>
        action.onSelect({
          keepOpen: () => event.preventDefault(),
          close,
          isOpen,
        })
      }
      className={
        reason
          ? 'flex-col items-start justify-center gap-0.5 py-1.5 data-[disabled]:opacity-100'
          : undefined
      }
    >
      {reason ? (
        <>
          <span className="text-muted-foreground">{action.label}</span>
          <span className="text-muted-foreground text-xs">{reason}</span>
        </>
      ) : (
        action.label
      )}
      {action.pending && (
        <span aria-hidden="true" className="skeleton-delayed ml-auto">
          <LoaderCircle className="animate-[spin_600ms_linear_infinite]" />
        </span>
      )}
    </DropdownMenuItem>
  );
}

export default function RowActionsMenuContent({
  trigger,
  openedBy,
  actions,
}: {
  trigger: ReactElement;
  openedBy: MenuOpenedBy;
  actions: readonly RowAction[];
}) {
  const [open, setOpen] = useState(true);
  const openRef = useRef(true);
  const change = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
  };
  const close = () => change(false);
  const isOpen = () => openRef.current;
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <DropdownMenu open={open} onOpenChange={change}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-72"
        {...menuAutoFocus(openedBy)}
      >
        {safe.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            close={close}
            isOpen={isOpen}
          />
        ))}
        {safe.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            close={close}
            isOpen={isOpen}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
