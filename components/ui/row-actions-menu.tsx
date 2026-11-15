'use client';

import { Ellipsis } from 'lucide-react';
import { lazy, type ComponentProps } from 'react';
import { Button } from './button';
import { DeferredMenu, useDeferredMenu } from './deferred-menu';

export interface RowAction {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  /** Visible under the label because a disabled menu item cannot be focused and touch has no tooltip. */
  disabledReason?: string;
}

const loadMenu = () => import('./row-actions-menu-content');
const RowActionsMenuContent = lazy(loadMenu);

/** `⋯` row menu (G11): the Radix menu loads on first hover/focus (PERF-04); safe actions first, destructive ones after a separator. */
export function RowActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: readonly RowAction[];
}) {
  const menu = useDeferredMenu(loadMenu);
  if (!actions.length) return null;
  const trigger = (props: ComponentProps<'button'>) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      data-slot="row-actions-trigger"
      className="text-muted-foreground pointer-coarse:size-11"
      {...props}
    >
      <Ellipsis aria-hidden="true" />
    </Button>
  );
  return (
    <DeferredMenu menu={menu} trigger={trigger}>
      {(openedBy, menuTrigger) => (
        <RowActionsMenuContent
          trigger={menuTrigger}
          openedBy={openedBy}
          actions={actions}
        />
      )}
    </DeferredMenu>
  );
}
