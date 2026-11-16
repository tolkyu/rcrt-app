'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';
import { vacancyDraftCountQuery } from '@/lib/queries/vacancies';
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
  const tCommon = useTranslations('common');
  const [loadedAt] = useState(Date.now);
  const { data } = useQuery({
    ...vacancyDraftCountQuery(),
    staleTime: draftCount === undefined ? 0 : DRAFT_COUNT_STALE_MS,
    ...(draftCount === undefined
      ? {}
      : { initialData: { count: draftCount }, initialDataUpdatedAt: loadedAt }),
  });
  const pending = pendingMode !== null;
  return (
    <>
      <Button asChild variant="outline" className="h-11 md:h-10">
        <Link href={listHref}>{tCommon('cancel')}</Link>
      </Button>
      <DisabledReason
        reason={tVacancies('createErrors.draftLimitReached', {
          count: VACANCY_DRAFT_LIMIT,
        })}
        disabled={(data?.count ?? 0) >= VACANCY_DRAFT_LIMIT}
      >
        <Button
          variant="outline"
          aria-busy={pendingMode === 'DRAFT' || undefined}
          aria-disabled={(pending && pendingMode !== 'DRAFT') || undefined}
          className="relative h-11 w-full md:h-10 md:w-auto"
          onClick={() => onSubmit('DRAFT')}
        >
          {feedback && pendingMode === 'DRAFT' && <feedback.Busy />}
          {t('actions.saveDraft')}
        </Button>
      </DisabledReason>
      <Button
        aria-busy={pendingMode === 'PUBLISH' || undefined}
        aria-disabled={(pending && pendingMode !== 'PUBLISH') || undefined}
        className="relative h-11 md:h-10"
        onClick={() => onSubmit('PUBLISH')}
      >
        {feedback && pendingMode === 'PUBLISH' && <feedback.Busy />}
        {t('actions.create')}
      </Button>
    </>
  );
}
