import { Lock } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

/** Preview/detail card head (G17): title clamped to 3 lines with the full text in `title`; actions row only when passed. */
export function DetailHeader({
  eyebrow,
  title,
  badges,
  note,
  actions,
  actionsRef,
}: {
  eyebrow?: string;
  title?: string;
  badges?: ReactNode;
  /** One muted line under the badges, with a lock: what only the viewer can see (private drafts). */
  note?: string;
  actions?: ReactNode;
  actionsRef?: Ref<HTMLDivElement>;
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
        {note && (
          <p className="text-muted-foreground-strong mt-3 flex items-center gap-1.5 text-xs">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            {note}
          </p>
        )}
      </div>
      {actions && (
        <div
          ref={actionsRef}
          data-slot="detail-header-actions"
          className="flex flex-wrap items-center gap-2"
        >
          {actions}
        </div>
      )}
    </div>
  );
}
