'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { lazy, useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  RowActionsMenu,
  type RowAction,
  type RowMenuHandle,
} from '@/components/ui/row-actions-menu';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import type { VacancyDetail, VacancySummary } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { focusRowTitle, nextRowTarget } from '@/lib/vacancy-claim';
import { refreshVacancy } from '@/lib/vacancy-refresh';
import { classifyTeamFailure, type TeamFailure } from '@/lib/vacancy-team';
import type { VacancyStatusAction } from '@/server/domain/vacancy-status/transitions';
import { LazyDialog } from './lazy-dialog';
import { useStatusToggle } from './use-change-status';
import { useSubmissionLock } from './use-submission-lock';
import type { TeamNext } from './use-team-write';

const CancelVacancyDialog = lazy(() => import('./cancel-vacancy-dialog'));
const ReopenVacancyDialog = lazy(() => import('./reopen-vacancy-dialog'));

type Kind = 'cancel' | 'reopen';

const LABELS = {
  HOLD: 'hold',
  RESUME: 'resume',
  CANCEL: 'cancel',
  REOPEN: 'reopen',
} as const;

const idle: RowMenuHandle = {
  keepOpen: () => undefined,
  close: () => undefined,
  isOpen: () => true,
};

/** A row that leaves the list takes focus with it: while focus is in the row (or in its dialog), it moves to the next row, never to <body>. */
function useFocusOnRowLeave(
  id: string,
  anchor: { readonly current: HTMLElement | null },
  hasDialog: () => boolean,
) {
  useLayoutEffect(() => {
    const row = anchor.current?.closest('tr, li');
    // Layout cleanups of a removed row run before its nodes leave the document, so the focus and the neighbours are still readable.
    return () => {
      if (hasDialog() || row?.contains(document.activeElement))
        nextRowTarget(id)?.focus();
    };
  }, [id, anchor, hasDialog]);
}

/**
 * Pause, resume, cancel and reopen from the list row `⋯` menu (STORY-VAC-02-1, D130). The items come from the list data; the card
 * version loads on hover or focus, and a press that beats it waits inside the open menu (spinner after 150 ms) and then runs.
 */
export default function StatusRowActions({
  vacancy,
  actions,
}: {
  vacancy: VacancySummary;
  actions: readonly VacancyStatusAction[];
}) {
  const t = useTranslations('vacancies.statusMenu');
  const tTeam = useTranslations('vacancies.team.toast');
  const queryClient = useQueryClient();
  const { toggle } = useStatusToggle(vacancy.id, vacancy.number);
  const { mountedRef } = useSubmissionLock();
  const wait = useRef<{
    action: VacancyStatusAction;
    menu: RowMenuHandle;
  } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const dialogOpen = useRef(false);
  const toTitle = useRef(false);
  const hasDialog = useCallback(() => dialogOpen.current, []);
  const [waiting, setWaiting] = useState<VacancyStatusAction | null>(null);
  const [dialog, setDialog] = useState<{
    kind: Kind;
    card: VacancyDetail;
  } | null>(null);
  useFocusOnRowLeave(vacancy.id, anchor, hasDialog);

  const readCard = () =>
    queryClient.getQueryData<VacancyDetail>(queryKeys.vacancy(vacancy.id));
  // No retries: a failed hover read must not hold the press behind backoff; the press reads again itself.
  const prefetch = () => {
    void queryClient.prefetchQuery({
      ...vacancyDetailQuery(vacancy.id),
      retry: false,
    });
  };

  const run = (action: VacancyStatusAction, card: VacancyDetail) => {
    if (action === 'HOLD' || action === 'RESUME') {
      toggle(action, card);
      return;
    }
    dialogOpen.current = true;
    setDialog({ kind: action === 'CANCEL' ? 'cancel' : 'reopen', card });
  };

  const announceLoadFailure = (failure: TeamFailure, retry: () => void) => {
    const options = { id: `status:${vacancy.id}` };
    if (failure === 'gone') {
      toast.error(tTeam('gone'), options);
      void refreshVacancy(queryClient, vacancy.id);
    } else if (failure === 'forbidden')
      toast.error(tTeam('forbidden'), options);
    else
      toast.error(t('toast.noConnection'), {
        ...options,
        description: t('toast.noConnectionDescription'),
        action: { label: t('toast.retry'), onAction: retry },
      });
  };

  const choose = (action: VacancyStatusAction, menu: RowMenuHandle) => {
    if (wait.current) {
      // Last press wins: the read in flight serves the newest choice, and the newest menu decides whether it was dismissed.
      menu.keepOpen();
      wait.current = { action, menu };
      setWaiting(action);
      return;
    }
    const card = readCard();
    if (card) {
      run(action, card);
      return;
    }
    // The version is still on its way: the menu stays open and the item waits instead of swallowing the press.
    menu.keepOpen();
    wait.current = { action, menu };
    setWaiting(action);
    let last = action;
    queryClient
      .fetchQuery({ ...vacancyDetailQuery(vacancy.id), retry: false })
      .then(
        (loaded) => ({ loaded }) as const,
        (error: unknown) => ({ failure: classifyTeamFailure(error) }) as const,
      )
      .then((result) => {
        const settled = wait.current;
        wait.current = null;
        if (!settled || !mountedRef.current) return;
        last = settled.action;
        setWaiting(null);
        // Esc or an outside click while waiting withdraws the press; checked before our own close, which would also read as closed.
        if (!settled.menu.isOpen()) return;
        settled.menu.close();
        if ('loaded' in result) run(settled.action, result.loaded);
        else
          announceLoadFailure(result.failure, () =>
            choose(settled.action, idle),
          );
      })
      .catch(() => {
        wait.current = null;
        if (mountedRef.current) setWaiting(null);
        toast.error(t('toast.failed'), {
          description: t('toast.failedDescription'),
          id: `status:${vacancy.id}`,
          action: {
            label: t('toast.retry'),
            onAction: () => choose(last, idle),
          },
        });
      });
  };

  const items: RowAction[] = actions.map((action) => ({
    id: action,
    label: t(LABELS[action]),
    destructive: action === 'CANCEL',
    pending: waiting === action,
    onSelect: (menu) => choose(action, menu),
  }));

  const close = (next: TeamNext | null) => {
    dialogOpen.current = false;
    // A cancelled vacancy has no items left, so the trigger is going away; a closed dialog means the card or the right is gone.
    toTitle.current =
      next === 'closed' || (next === 'done' && dialog?.kind === 'cancel');
    setDialog(null);
  };
  const closeAutoFocus = (event: Event) => {
    event.preventDefault();
    if (toTitle.current) focusRowTitle(vacancy.id);
    else
      anchor.current
        ?.querySelector<HTMLElement>('[data-slot="row-actions-trigger"]')
        ?.focus();
    toTitle.current = false;
  };
  const dialogProps = {
    onClose: close,
    onCloseAutoFocus: closeAutoFocus,
  };

  return (
    <>
      <span
        ref={anchor}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        className="shrink-0"
      >
        <RowActionsMenu
          label={t('menuLabel', { title: vacancy.title })}
          actions={items}
        />
      </span>
      {dialog && (
        <LazyDialog
          open
          onFailed={() => {
            dialogOpen.current = false;
            setDialog(null);
          }}
        >
          {dialog.kind === 'cancel' ? (
            <CancelVacancyDialog vacancy={dialog.card} {...dialogProps} />
          ) : (
            <ReopenVacancyDialog vacancy={dialog.card} {...dialogProps} />
          )}
        </LazyDialog>
      )}
    </>
  );
}
