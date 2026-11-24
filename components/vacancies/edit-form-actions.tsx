'use client';

import { useTranslations } from 'next-intl';
import { SubmitButtons } from '@/components/vacancies/submit-buttons';
import type { VacancyFormMode } from '@/lib/vacancy-form';
import type { FeedbackModule } from '@/lib/vacancy-form-load';

/** Footer of the edit form: leave, save the changes and publish. */
export function EditFormActions({
  listHref,
  pendingMode,
  locked,
  feedback,
  onSubmit,
}: {
  listHref: string;
  pendingMode: VacancyFormMode | null;
  locked?: boolean;
  feedback: FeedbackModule | null;
  onSubmit: (mode: VacancyFormMode) => void;
}) {
  const t = useTranslations('vacancyForm.edit.actions');
  return (
    <SubmitButtons
      listHref={listHref}
      secondaryLabel={t('save')}
      primaryLabel={t('publish')}
      pendingMode={pendingMode}
      locked={locked}
      feedback={feedback}
      onSubmit={onSubmit}
    />
  );
}
