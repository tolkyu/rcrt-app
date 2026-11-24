import { Info, Lock } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

/** Preview/detail card head (G17): title clamped to 3 lines with the full text in `title`; actions row only when passed. */
export function DetailHeader({
  eyebrow,
  title,
  badges,
  note,
  noteIcon = 'lock',
  tone,
  actions,
  actionsRef,
}: {
  eyebrow?: string;
  title?: string;
  badges?: ReactNode;
  /** One muted line under the badges: a lock for what only the viewer can see (private drafts), an info mark for a neutral explanation. */
  note?: string;
  noteIcon?: 'lock' | 'info';
  /** Red block behind eyebrow, title and badges; the actions stay outside the tint. */
  tone?: 'urgent';
  actions?: ReactNode;
  actionsRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div data-slot="detail-header" className="flex min-w-0 flex-col gap-5">
      <div
        className={cn(
          'min-w-0',
          tone === 'urgent' &&
            'bg-destructive-subtle rounded-lg p-4 shadow-[inset_3px_0_0_var(--destructive)]',
        )}
      >
        {eyebrow && (
          <p
            className={cn(
              'mb-2 text-xs font-medium tabular-nums',
              tone === 'urgent'
                ? 'text-muted-foreground-strong'
                : 'text-muted-foreground',
            )}
          >
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
            {noteIcon === 'info' ? (
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            )}
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
