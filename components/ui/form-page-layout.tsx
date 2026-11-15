'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useId,
  type FormEventHandler,
  type ReactNode,
} from 'react';
import { useLeaveGuard } from './use-leave-guard';

const ConfirmDialog = lazy(() =>
  import('./confirm-dialog').then((module) => ({
    default: module.ConfirmDialog,
  })),
);

/**
 * Create/edit page (F9): back link, title, the form body and a footer that sticks above the BottomNav.
 * Footer actions go primary last (thumb zone); on a phone they share the row and the primary wraps to full width.
 * While `dirty`, leaving by a link, Back or tab close asks first; the dialog chunk loads only then.
 */
export function FormPageLayout({
  title,
  subtitle,
  back,
  dirty,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  back: { href: string; label: string };
  dirty: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  footer: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('common');
  const titleId = useId();
  const guard = useLeaveGuard(dirty);
  return (
    <>
      <Link
        href={back.href}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm md:min-h-9"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <div className="mt-2 mb-6">
        <h1
          id={titleId}
          className="text-heading-lg text-foreground md:text-display-xl"
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      <form
        noValidate
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
      >
        {children}
        <div
          data-slot="form-page-footer"
          className="border-border bg-surface sticky bottom-(--chrome-bottom) z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t px-4 py-3 md:bottom-0 md:mx-0 md:rounded-b-xl md:px-0 [&>*]:flex-1 md:[&>*]:flex-none"
        >
          {footer}
        </div>
      </form>
      {guard.asking && (
        <Suspense fallback={null}>
          <ConfirmDialog
            open
            onOpenChange={(open) => {
              if (!open) guard.stay();
            }}
            tone="destructive"
            title={t('leaveTitle')}
            description={t('leaveDescription')}
            confirmLabel={t('leaveConfirm')}
            cancelLabel={t('leaveStay')}
            onConfirm={guard.confirm}
          />
        </Suspense>
      )}
    </>
  );
}
