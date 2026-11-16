'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type FormEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import { LoadBoundary } from './load-boundary';
import { useLeaveGuard, type LeaveGuardHandle } from './use-leave-guard';

const ConfirmDialog = lazy(() =>
  import('./confirm-dialog').then((module) => ({
    default: module.ConfirmDialog,
  })),
);

/** Fallback when the dialog chunk is gone (a tab older than the last deploy): the browser's own question keeps the input safe. */
function NativeLeaveQuestion({
  question,
  onAnswer,
}: {
  question: string;
  onAnswer: (leave: boolean) => void;
}) {
  const answered = useRef(false);
  useEffect(() => {
    if (answered.current) return;
    answered.current = true;
    onAnswer(window.confirm(question));
  }, [question, onAnswer]);
  return null;
}

/**
 * Create/edit page (F9): back link, title, the form body and a footer that sticks above the BottomNav.
 * Footer actions go primary last (thumb zone); on a phone they share the row and the primary wraps to full width.
 * While `dirty`, leaving by a link, Back or tab close asks first; the dialog chunk loads only then.
 * `guardRef.release()` after a successful save, then `router.replace(target)`, leaves without the question.
 */
export function FormPageLayout({
  title,
  subtitle,
  back,
  dirty,
  guardRef,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  back: { href: string; label: string };
  dirty: boolean;
  guardRef?: Ref<LeaveGuardHandle>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  footer: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('common');
  const titleId = useId();
  const guard = useLeaveGuard(dirty);
  const { release } = guard;
  useImperativeHandle(guardRef, () => ({ release }), [release]);
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
          className="border-border bg-surface after:bg-surface sticky bottom-(--chrome-bottom) z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t px-4 py-3 after:absolute after:inset-x-0 after:top-full after:h-[env(safe-area-inset-bottom)] md:bottom-0 md:mx-0 md:rounded-b-xl md:px-0 md:after:hidden [&>*]:flex-1 md:[&>*]:flex-none"
        >
          {footer}
        </div>
      </form>
      {guard.asking && (
        <LoadBoundary
          fallback={
            <NativeLeaveQuestion
              question={t('leaveTitle')}
              onAnswer={(leave) => (leave ? guard.confirm() : guard.stay())}
            />
          }
        >
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
        </LoadBoundary>
      )}
    </>
  );
}
