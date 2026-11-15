'use client';

import type { ReactElement } from 'react';
import { menuAutoFocus, type MenuOpenedBy } from './deferred-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import type { RowAction } from './row-actions-menu';

function ActionItem({ action }: { action: RowAction }) {
  const reason = action.disabledReason;
  return (
    <DropdownMenuItem
      variant={action.destructive ? 'destructive' : 'default'}
      disabled={Boolean(reason)}
      onSelect={action.onSelect}
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
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-72"
        {...menuAutoFocus(openedBy)}
      >
        {safe.map((action) => (
          <ActionItem key={action.id} action={action} />
        ))}
        {safe.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map((action) => (
          <ActionItem key={action.id} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
