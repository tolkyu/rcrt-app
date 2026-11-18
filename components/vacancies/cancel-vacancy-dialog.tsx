'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { reasonLength, VACANCY_REASON_MAX } from '@/lib/reason-length';
import { useStatusWrite, type StatusSubject } from './use-change-status';
import { closeWhenDone, type TeamDialogProps } from './use-team-write';

/** Lazy chunk (default export). Opens on «Залишити вакансію»: cancelling is final (wireframe §3.5); the typed reason survives a failed attempt. */
export default function CancelVacancyDialog({
  vacancy,
  onClose,
  onCloseAutoFocus,
}: TeamDialogProps & { vacancy: StatusSubject }) {
  const t = useTranslations('vacancies.statusMenu.cancelDialog');
  const tTeam = useTranslations('vacancies.team');
  const { pending, error, cancel, mountedRef } = useStatusWrite(vacancy);
  return (
    <ConfirmDialog
      open
      tone="destructive"
      onOpenChange={(open) => {
        if (!open) onClose(null);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      title={t('title')}
      description={tTeam('dialogHeader', {
        number: vacancy.number,
        title: vacancy.title,
        vertical: vacancy.vertical.name,
      })}
      clampDescription
      consequence={[t('consequence')]}
      reason={{
        label: t('reasonLabel'),
        hint: t('reasonHint'),
        maxLength: VACANCY_REASON_MAX,
        countLength: reasonLength,
      }}
      confirmLabel={t('confirm')}
      cancelLabel={t('keep')}
      pending={pending}
      error={error}
      onConfirm={(reason) => closeWhenDone(cancel(reason), mountedRef, onClose)}
    />
  );
}
