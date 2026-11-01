import type { ReactNode } from 'react';

/** Page title (`display-xl`, `heading-lg` on mobile) + one-line subtitle; actions on the right (screens.md §1.1). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
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
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
