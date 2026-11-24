'use client';

import { useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type FormEventHandler,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import { useStickyFooter } from '@/lib/use-sticky-bar';
import { FormPageFooter, FormPageHeading } from './form-page-frame';
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
  onKeyDown,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  back: { href: string; label: string };
  dirty: boolean;
  guardRef?: Ref<LeaveGuardHandle>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Form-wide shortcuts (e.g. Ctrl+Enter); bubbles from every field. */
  onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
  footer: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('common');
  const titleId = useId();
  const guard = useLeaveGuard(dirty);
  const footerRef = useStickyFooter();
  const { release } = guard;
  useImperativeHandle(guardRef, () => ({ release }), [release]);
  return (
    <>
      <FormPageHeading
        titleId={titleId}
        title={title}
        subtitle={subtitle}
        back={back}
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- only keys that bubble up from the form's own fields arrive here; the form is not a control */}
      <form
        noValidate
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-6"
      >
        {children}
        <FormPageFooter stickyRef={footerRef}>{footer}</FormPageFooter>
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
