'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import type { TeamDialogProps } from './use-team-write';

/** Picker dialog frame: title, one-line vacancy header, scrolling body and a footer that never scrolls away (wireframe §3). */
export function TeamDialogShell({
  title,
  vacancy,
  pending,
  onClose,
  onCloseAutoFocus,
  footer,
  children,
}: TeamDialogProps & {
  title: string;
  vacancy: Pick<VacancyDetail, 'number' | 'title' | 'vertical'>;
  pending: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('vacancies.team');
  const tCommon = useTranslations('common');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // A request in flight cannot be cancelled from here: closing would hide its outcome.
        if (!open && !pending) onClose(null);
      }}
    >
      <DialogContent
        closeLabel={tCommon('close')}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="flex flex-col gap-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">
            {t('dialogHeader', {
              number: vacancy.number,
              title: vacancy.title,
              vertical: vacancy.vertical.name,
            })}
          </DialogDescription>
        </div>
        {/* Only the body scrolls, so the buttons stay reachable at 320 px and 200 % zoom; -m-1/p-1 keeps focus rings inside the clip. */}
        <div className="-m-1 flex min-h-0 flex-col gap-4 overflow-y-auto p-1">
          {children}
        </div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamAlert({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  const t = useTranslations('vacancies.team');
  return (
    <div
      role="alert"
      className="bg-destructive-subtle text-error-text flex flex-col items-start gap-2 rounded-lg p-3 text-sm"
    >
      <p className="flex items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="[overflow-wrap:anywhere]">{children}</span>
      </p>
      {onRetry && (
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

export function PickerLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-1">
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Primary footer button: stays focusable (`aria-disabled`) while a condition is unmet, spinner only after 150 ms. */
export function TeamSubmit({
  blocked,
  pending,
  describedBy,
  onClick,
  children,
}: {
  blocked: boolean;
  pending: boolean;
  describedBy?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      aria-disabled={blocked || pending || undefined}
      aria-busy={pending || undefined}
      aria-describedby={blocked ? describedBy : undefined}
      className={
        pending
          ? 'aria-disabled:bg-primary aria-disabled:text-primary-foreground relative'
          : 'relative'
      }
      onClick={() => {
        if (!blocked && !pending) onClick();
      }}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="skeleton-delayed absolute inset-y-0 left-2 flex items-center"
        >
          <LoaderCircle className="size-3.5 animate-[spin_600ms_linear_infinite]" />
        </span>
      )}
      {children}
    </Button>
  );
}
