import type { ReactNode } from 'react';
import { StickyActionBar } from '@/components/ui/sticky-action-bar';

/**
 * Page title (`display-xl`, `heading-lg` on mobile) + one-line subtitle; actions on the right in the order
 * [secondary, primary] (screens.md §1.1, G6). Below md the primary action moves to a StickyActionBar; it is
 * rendered in both places and CSS shows one, so keep it a stateless link or button.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  primary,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  primary?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-heading-lg text-foreground md:text-display-xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {(actions || primary) && (
        <div className="flex items-center gap-2">
          {actions}
          {primary && <span className="hidden md:contents">{primary}</span>}
        </div>
      )}
      {primary && <StickyActionBar>{primary}</StickyActionBar>}
    </div>
  );
}
