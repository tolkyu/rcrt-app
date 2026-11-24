'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lazy, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  RowActionsMenu,
  type RowAction,
} from '@/components/ui/row-actions-menu';
import { RowActionsSheet } from '@/components/ui/row-actions-sheet';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { useMobile } from '@/lib/use-mobile';
import { actionsFrom } from '@/server/domain/vacancy-status/transitions';
import { LazyDialog } from './lazy-dialog';
import { StepUpAction } from './step-up-action';
import { useToggleStatus } from './use-change-status';
import type { TeamNext } from './use-team-write';

const CancelVacancyDialog = lazy(() => import('./cancel-vacancy-dialog'));
const ReopenVacancyDialog = lazy(() => import('./reopen-vacancy-dialog'));

type Kind = 'cancel' | 'reopen';

const buttonClass = 'h-11 max-md:basis-full';
const lockedButtonClass = 'h-11 max-md:w-full';

/**
 * Pause, resume, cancel and reopen of the card and the preview (STORY-VAC-02-1, D130): every control renders from the server's
 * `statusActions` and the services re-check. The dialogs live here, not under their buttons, so a button that disappears after
 * a save (cancelled vacancies have none) cannot take its own dialog, and the focus move, with it.
 */
export default function StatusActions({
  vacancy,
  preview,
}: {
  vacancy: VacancyDetail;
  preview: boolean;
}) {
  const t = useTranslations('vacancies.statusMenu');
  const { pending, toggle } = useToggleStatus(vacancy);
  const mobile = useMobile();
  const [dialog, setDialog] = useState<Kind | null>(null);
  const focusHeading = useRef(false);
  const { statusActions } = vacancy;
  const switcher = statusActions.find(
    (action) => action === 'HOLD' || action === 'RESUME',
  );
  const reopen = statusActions.includes('REOPEN');
  const cancel = statusActions.includes('CANCEL');
  // D63: the card button the viewer would get after 2FA; the preview's menu has no place for a reason, so only the card shows it.
  const locked =
    vacancy.needsMfa && !preview ? actionsFrom(vacancy.status) : [];
  const lockedSwitcher = switcher
    ? undefined
    : locked.find((action) => action === 'HOLD' || action === 'RESUME');
  const lockedReopen = !reopen && locked.includes('REOPEN');

  const close = (next: TeamNext | null) => {
    setDialog(null);
    focusHeading.current = next === 'done' || next === 'closed';
  };
  const closeAutoFocus = (event: Event) => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    event.preventDefault();
    // The opening item is gone with the status change, so focus goes to the card's title instead of <body> (wireframe §8).
    const heading = document.querySelector<HTMLElement>(
      preview ? '[data-slot="detail-header"] h2' : '#main h1',
    );
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  };

  const label = switcher && t(switcher === 'HOLD' ? 'hold' : 'resume');
  const items: RowAction[] = [
    ...(preview && switcher && label
      ? [{ id: 'switch', label, onSelect: () => toggle(switcher) }]
      : []),
    ...(preview && reopen
      ? [
          {
            id: 'reopen',
            label: t('reopen'),
            onSelect: () => setDialog('reopen'),
          },
        ]
      : []),
    ...(cancel
      ? [
          {
            id: 'cancel',
            label: t('cancel'),
            destructive: true,
            onSelect: () => setDialog('cancel'),
          },
        ]
      : []),
  ];
  const menu = mobile ? (
    <RowActionsSheet
      label={t('moreActions')}
      title={t('menuLabel', { title: vacancy.title })}
      actions={items}
    />
  ) : (
    <RowActionsMenu
      label={t('menuLabel', { title: vacancy.title })}
      actions={items}
    />
  );
  const dismiss = () => setDialog(null);
  const dialogProps = {
    vacancy,
    onClose: close,
    onCloseAutoFocus: closeAutoFocus,
  };

  return (
    <>
      {/* Phone: «Поділитися» + `⋯`, then the full-width status action; the DOM follows that order so Tab matches what is seen. */}
      {mobile && menu}
      {!preview && switcher && (
        <Button
          size="sm"
          variant="outline"
          className={buttonClass}
          aria-busy={pending || undefined}
          onClick={() => toggle(switcher)}
        >
          {switcher === 'HOLD' ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {label}
        </Button>
      )}
      {!preview && reopen && (
        <Button
          size="sm"
          className={buttonClass}
          onClick={() => setDialog('reopen')}
        >
          <RotateCcw aria-hidden="true" />
          {t('reopen')}
        </Button>
      )}
      {lockedSwitcher && (
        <StepUpAction actionClassName="max-md:w-full">
          <Button size="sm" variant="outline" className={lockedButtonClass}>
            {lockedSwitcher === 'HOLD' ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {t(lockedSwitcher === 'HOLD' ? 'hold' : 'resume')}
          </Button>
        </StepUpAction>
      )}
      {lockedReopen && (
        <StepUpAction actionClassName="max-md:w-full">
          <Button size="sm" className={lockedButtonClass}>
            <RotateCcw aria-hidden="true" />
            {t('reopen')}
          </Button>
        </StepUpAction>
      )}
      {!mobile && menu}
      <LazyDialog open={dialog === 'cancel'} onFailed={dismiss}>
        <CancelVacancyDialog {...dialogProps} />
      </LazyDialog>
      <LazyDialog open={dialog === 'reopen'} onFailed={dismiss}>
        <ReopenVacancyDialog {...dialogProps} />
      </LazyDialog>
    </>
  );
}
