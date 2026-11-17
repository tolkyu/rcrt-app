'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitButtons } from '@/components/vacancies/submit-buttons';
import { DisabledReason } from '@/components/ui/disabled-reason';
import { vacancyDraftCountQuery } from '@/lib/queries/vacancy-detail';
import type { VacancyFormMode } from '@/lib/vacancy-form';
import type { FeedbackModule } from '@/lib/vacancy-form-load';
import { VACANCY_DRAFT_LIMIT } from '@/lib/vacancy-limits';

/** The server's count is fresh for this long, so mounting does not repeat the request the page already made. */
const DRAFT_COUNT_STALE_MS = 30_000;

/** Footer of the create form: leave, save as draft (explains itself at the 50-draft limit; the server stays the authority) and publish. */
export function CreateFormActions({
  listHref,
  pendingMode,
  feedback,
  draftCount,
  onSubmit,
}: {
  listHref: string;
  pendingMode: VacancyFormMode | null;
  feedback: FeedbackModule | null;
  /** The count the server read for this page load: it paints the button state at once and stays fresh for 30 s. */
  draftCount: number | undefined;
  onSubmit: (mode: VacancyFormMode) => void;
}) {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  const [loadedAt] = useState(Date.now);
  const { data } = useQuery({
    ...vacancyDraftCountQuery(),
    staleTime: draftCount === undefined ? 0 : DRAFT_COUNT_STALE_MS,
    ...(draftCount === undefined
      ? {}
      : { initialData: { count: draftCount }, initialDataUpdatedAt: loadedAt }),
  });
  return (
    <SubmitButtons
      listHref={listHref}
      secondaryLabel={t('actions.saveDraft')}
      primaryLabel={t('actions.create')}
      pendingMode={pendingMode}
      feedback={feedback}
      onSubmit={onSubmit}
      wrapSecondary={(button) => (
        <DisabledReason
          reason={tVacancies('createErrors.draftLimitReached', {
            count: VACANCY_DRAFT_LIMIT,
          })}
          disabled={(data?.count ?? 0) >= VACANCY_DRAFT_LIMIT}
        >
          {button}
        </DisabledReason>
      )}
    />
  );
}
