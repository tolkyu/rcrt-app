'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { RowAction } from '@/components/ui/row-actions-menu';
import { reasonLength, VACANCY_REASON_MAX } from '@/lib/reason-length';
import { hasOnlyReasonChars } from '@/lib/reason-text';
import { toast } from '@/lib/toast';
import {
  watchVacancyAccess,
  type VacancyAccessWatch,
} from '@/lib/vacancy-detail-cache';
import {
  applyClosed,
  closeDraft,
  closedLandingHref,
  refreshDraft,
  type ClosableDraft,
  type CloseFailure,
  type CloseKind,
} from '@/lib/vacancy-draft-close';
import {
  CLEAR,
  planAttempt,
  settle,
  type RetryState,
} from '@/lib/vacancy-draft-retry';
import { useDraftLeave } from './draft-leave';
import type { CardFocus } from './use-draft-publish';

type Translate = ReturnType<typeof useTranslations<'vacancies'>>;

export const openCardAction = (
  t: Translate,
  openCard: () => void,
): RowAction => ({ id: 'open', label: t('openCard'), onSelect: openCard });

/** Cancel (a draft only) and delete as menu items; destructive, so the menu puts them after a separator. */
export function closeActions(
  t: Translate,
  open: (kind: CloseKind) => void,
  stage: ClosableDraft['status'],
): RowAction[] {
  const item = (kind: CloseKind): RowAction => ({
    id: kind,
    label: t(
      kind === 'cancel' ? 'draft.actions.cancel' : 'draft.actions.delete',
    ),
    destructive: true,
    onSelect: () => open(kind),
  });
  return stage === 'DRAFT'
    ? [item('cancel'), item('delete')]
    : [item('delete')];
}

const FLUSH_FALLBACK_MS = 600;

/** The toast is global, so the result reaches the user after the row that started the call unmounted. */
function announceClosed(t: Translate, kind: CloseKind, draft: ClosableDraft) {
  if (kind === 'cancel')
    toast.success(t('draft.close.toast.cancelled'), {
      description: t('draft.close.toast.cancelledDescription', {
        number: draft.number,
      }),
    });
  else
    toast.success(
      t(
        draft.status === 'DRAFT'
          ? 'draft.close.toast.deletedDraft'
          : 'draft.close.toast.deletedCancelled',
      ),
      {
        description: t('draft.close.toast.deletedDescription', {
          number: draft.number,
          title: draft.title,
        }),
      },
    );
}

const announceGone = (t: Translate) =>
  toast.error(t('draft.actions.toast.gone'), {
    description: t('draft.actions.toast.goneDescription'),
  });

const failureText = (t: Translate, failure: CloseFailure): string => {
  switch (failure) {
    case 'notDraft':
      return t('draftErrors.notDraft');
    case 'stale':
      return t('draftErrors.stale');
    case 'rateLimited':
      return t('draft.actions.toast.rateLimited');
    case 'forbidden':
      return t('draft.actions.toast.forbidden');
    case 'invalid':
      return t('draft.close.error.invalid');
    case 'network':
      return t('draft.close.error.network');
    default:
      return t('draft.close.error.failed');
  }
};

/** Pessimistic on purpose, and the row leaves only after the dialog's close event, so its focus trap never fights the focus move. */
export function useDraftClose(draft: ClosableDraft, card?: CardFocus) {
  const t = useTranslations('vacancies');
  const router = useRouter();
  const queryClient = useQueryClient();
  const leave = useDraftLeave();
  const [kind, setKind] = useState<CloseKind>('cancel');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<CloseFailure | null>(null);
  const locked = useRef(false);
  const retry = useRef<RetryState>(CLEAR);
  const mounted = useRef(true);
  const after = useRef<(() => void) | null>(null);

  const fallbackTimer = useRef<number | undefined>(undefined);

  const flush = () => {
    window.clearTimeout(fallbackTimer.current);
    const run = after.current;
    after.current = null;
    run?.();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A row that unmounts before the close event must not swallow the answer.
      flush();
    };
  }, []);

  async function finish(
    done: CloseKind,
    vacancy: Parameters<typeof applyClosed>[2],
    stillAllowed: VacancyAccessWatch,
  ) {
    try {
      try {
        await applyClosed(
          queryClient,
          draft,
          vacancy,
          () => {
            if (!leave?.removed(draft.id) && done === 'cancel') card?.removed();
            // Before the removal, which unmounts this card and would end its navigation.
            if (done === 'delete' && !leave && mounted.current)
              router.replace(closedLandingHref(draft));
          },
          stillAllowed,
        );
        leave?.settled(draft.id);
      } finally {
        // The server already did the work: the user hears it even when the cache write fails.
        announceClosed(t, done, draft);
      }
    } catch {
      // The server did it; whatever went wrong locally, the caches read it again.
      refreshDraft(queryClient, draft.id);
    } finally {
      // A deleted draft on its own page stays locked until the page is left.
      if (done === 'cancel' || leave) locked.current = false;
      if (mounted.current) setPending(false);
      // The Next router cache could otherwise hydrate the deleted card back on Forward.
      if (done === 'delete') router.refresh();
    }
  }

  async function run(reason: string) {
    if (kind === 'cancel' && !hasOnlyReasonChars(reason)) {
      locked.current = false;
      setFailure('invalid');
      setPending(false);
      return;
    }
    const attempt = planAttempt(retry.current, kind, reason);
    // A call that throws before it answers still keeps what planning decided.
    retry.current = settle(attempt, { status: 'busy' });
    const stillAllowed = watchVacancyAccess(queryClient, draft.id);
    const outcome = await closeDraft(
      queryClient,
      kind,
      draft,
      reason,
      attempt.kind === 'retry',
    );
    retry.current = settle(attempt, outcome);
    if (outcome.status === 'done') {
      const { vacancy } = outcome;
      after.current = () => {
        finish(kind, vacancy, stillAllowed).catch(() => undefined);
      };
      setOpen(false);
      // The close event normally runs it; this covers a close that never reports.
      fallbackTimer.current = window.setTimeout(flush, FLUSH_FALLBACK_MS);
      return;
    }
    locked.current = false;
    setPending(false);
    if (outcome.status === 'busy') return;
    if (outcome.failure === 'gone') {
      setOpen(false);
      announceGone(t);
      refreshDraft(queryClient, draft.id);
    } else setFailure(outcome.failure);
  }

  const confirm = (reason: string) => {
    // Set before the first await, so a double press sends one request.
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setFailure(null);
    run(reason).catch(() => {
      locked.current = false;
      setFailure('failed');
      setPending(false);
    });
  };

  const changeOpen = (next: boolean) => {
    setOpen(next);
    // A conflict means the data moved on; the list reads it again once the user has seen the message.
    if (!next && (failure === 'notDraft' || failure === 'stale'))
      refreshDraft(queryClient, draft.id);
  };

  const openDialog = (next: CloseKind) => {
    setKind(next);
    setFailure(null);
    retry.current = CLEAR;
    setOpen(true);
  };

  const cancelling = kind === 'cancel';
  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={changeOpen}
      onCloseAutoFocus={flush}
      tone="destructive"
      title={t(
        cancelling
          ? 'draft.close.cancel.title'
          : draft.status === 'DRAFT'
            ? 'draft.close.delete.titleDraft'
            : 'draft.close.delete.titleCancelled',
      )}
      description={t('draft.close.description', {
        number: draft.number,
        title: draft.title,
      })}
      clampDescription
      consequence={
        cancelling
          ? [
              t('draft.close.cancel.consequences.closed'),
              t('draft.close.cancel.consequences.visibility'),
              t('draft.close.cancel.consequences.deleteHint'),
            ]
          : [
              t('draft.close.delete.consequences.gone'),
              t('draft.close.delete.consequences.number', {
                number: draft.number,
              }),
              ...(draft.status === 'DRAFT'
                ? [t('draft.close.delete.consequences.cancelHint')]
                : []),
            ]
      }
      confirmLabel={t(
        cancelling
          ? 'draft.close.cancel.confirm'
          : 'draft.close.delete.confirm',
      )}
      cancelLabel={t(
        cancelling ? 'draft.close.cancel.keep' : 'draft.close.delete.keep',
      )}
      reason={
        cancelling
          ? {
              label: t('draft.close.cancel.reasonLabel'),
              hint: t('draft.close.cancel.reasonHint'),
              maxLength: VACANCY_REASON_MAX,
              countLength: reasonLength,
            }
          : undefined
      }
      pending={pending}
      error={failure ? failureText(t, failure) : undefined}
      onConfirm={confirm}
    />
  );
  return { openDialog, dialog };
}
