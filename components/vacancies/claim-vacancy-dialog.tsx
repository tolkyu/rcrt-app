'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { useClaimVacancy } from './use-claim-vacancy';
import {
  closeWhenDone,
  useFailureText,
  type TeamDialogProps,
} from './use-team-write';

/** Lazy chunk (default export). Opens on the primary button: Enter confirms in one keystroke (wireframe §3.3). */
export default function ClaimVacancyDialog({
  vacancy,
  onClose,
  onCloseAutoFocus,
}: TeamDialogProps & {
  vacancy: Pick<VacancySummary, 'id' | 'number' | 'title'>;
}) {
  const t = useTranslations('vacancies.team');
  const failureText = useFailureText();
  const tConflict = useTranslations('vacancies.teamConflicts');
  const { pending, failure, claim, mountedRef } = useClaimVacancy(vacancy);
  return (
    <ConfirmDialog
      open
      focusConfirm
      onOpenChange={(open) => {
        if (!open) onClose(null);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      title={t('claimDialog.title')}
      description={t('claimDialog.body', {
        title: vacancy.title,
        number: vacancy.number,
      })}
      clampDescription
      confirmLabel={t('claimDialog.confirm')}
      cancelLabel={t('claimDialog.cancel')}
      pending={pending}
      error={failureText(failure, { closed: tConflict('VACANCY_CLOSED') }, [
        'taken',
      ])}
      onConfirm={() => closeWhenDone(claim(), mountedRef, onClose)}
    />
  );
}
