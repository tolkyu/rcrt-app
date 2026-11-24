import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Icon in a tinted circle, title, one line, optional primary action (UI-06, 01-components §05). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 px-4 py-8 text-center',
        className,
      )}
    >
      <span className="bg-primary-subtle flex size-12 items-center justify-center rounded-full">
        <Icon className="text-brand size-6" aria-hidden="true" />
      </span>
      <p className="text-foreground text-sm font-semibold">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
