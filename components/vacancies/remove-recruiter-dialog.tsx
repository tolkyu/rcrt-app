'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { useRemoveRecruiter } from './use-assign-recruiters';
import { closeWhenDone, type TeamDialogProps } from './use-team-write';

/** Lazy chunk (default export). Opens on «Залишити»: removing is destructive (wireframe §3.2). */
export default function RemoveRecruiterDialog({
  vacancy,
  recruiter,
  onClose,
  onCloseAutoFocus,
}: TeamDialogProps & {
  vacancy: VacancyDetail;
  recruiter: VacancyDetail['recruiters'][number];
}) {
  const t = useTranslations('vacancies.team');
  const { pending, failure, remove, mountedRef } = useRemoveRecruiter(vacancy);
  const last = vacancy.recruiters.length === 1;
  const consequence = !last
    ? t('removeDialog.others')
    : vacancy.status === 'ON_HOLD'
      ? t('removeDialog.lastHold')
      : t('removeDialog.lastOpen', { vertical: vacancy.vertical.name });
  return (
    <ConfirmDialog
      open
      tone="destructive"
      onOpenChange={(open) => {
        if (!open) onClose(null);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      title={t('removeDialog.title')}
      description={t('removeDialog.body', {
        name: recruiter.fullName,
        title: vacancy.title,
        number: vacancy.number,
      })}
      clampDescription
      consequence={[consequence]}
      confirmLabel={t('removeDialog.confirm')}
      cancelLabel={t('removeDialog.keep')}
      pending={pending}
      error={
        failure === 'network' || failure === 'failed'
          ? t('noConnection')
          : undefined
      }
      onConfirm={() =>
        closeWhenDone(
          remove(recruiter.id, recruiter.fullName),
          mountedRef,
          onClose,
        )
      }
    />
  );
}
