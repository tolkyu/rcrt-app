import type { ReactNode } from 'react';

/** Preview/detail card head (G17): title clamped to 3 lines with the full text in `title`; actions row only when passed. */
export function DetailHeader({
  eyebrow,
  title,
  badges,
  actions,
}: {
  eyebrow?: string;
  title?: string;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div data-slot="detail-header" className="flex min-w-0 flex-col gap-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-muted-foreground mb-2 text-xs font-medium tabular-nums">
            {eyebrow}
          </p>
        )}
        {title && (
          <h2
            title={title}
            className="text-heading-lg mb-3 line-clamp-3 [overflow-wrap:anywhere]"
          >
            {title}
          </h2>
        )}
        {badges && (
          <div className="flex flex-wrap items-center gap-2">{badges}</div>
        )}
      </div>
      {actions && (
        <div
          data-slot="detail-header-actions"
          className="flex flex-wrap items-center gap-2"
        >
          {actions}
        </div>
      )}
    </div>
  );
}
