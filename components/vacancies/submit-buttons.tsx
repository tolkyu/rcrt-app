'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { VacancyFormMode } from '@/lib/vacancy-form';
import type { FeedbackModule } from '@/lib/vacancy-form-load';

/**
 * Footer of both vacancy forms: leave, a secondary save and the primary action. A second press while one is pending is ignored
 * (`aria-disabled`, not `disabled`, so focus stays); `locked` does the same for work that is not a press (a reload).
 */
export function SubmitButtons({
  listHref,
  secondaryLabel,
  primaryLabel,
  pendingMode,
  locked = false,
  feedback,
  onSubmit,
  wrapSecondary = (button) => button,
}: {
  listHref: string;
  secondaryLabel: string;
  primaryLabel: string;
  pendingMode: VacancyFormMode | null;
  locked?: boolean;
  feedback: FeedbackModule | null;
  onSubmit: (mode: VacancyFormMode) => void;
  /** The create form explains a disabled save here. */
  wrapSecondary?: (button: ReactElement<ButtonProps>) => ReactElement;
}) {
  const t = useTranslations('vacancyForm.actions');
  const blocked = (mode: VacancyFormMode) =>
    (pendingMode !== null && pendingMode !== mode) || locked || undefined;
  return (
    <>
      <Button asChild variant="outline" className="h-11 md:h-10">
        <Link href={listHref}>{t('leave')}</Link>
      </Button>
      {wrapSecondary(
        <Button
          variant="outline"
          aria-busy={pendingMode === 'DRAFT' || undefined}
          aria-disabled={blocked('DRAFT')}
          className="relative h-11 w-full md:h-10 md:w-auto"
          onClick={() => onSubmit('DRAFT')}
        >
          {feedback && pendingMode === 'DRAFT' && <feedback.Busy />}
          {secondaryLabel}
        </Button>,
      )}
      <Button
        aria-busy={pendingMode === 'PUBLISH' || undefined}
        aria-disabled={blocked('PUBLISH')}
        className="relative h-11 md:h-10"
        onClick={() => onSubmit('PUBLISH')}
      >
        {feedback && pendingMode === 'PUBLISH' && <feedback.Busy />}
        {primaryLabel}
      </Button>
    </>
  );
}
