'use client';

import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FormAlert } from '@/components/vacancies/form-alert';
import { VACANCY_DRAFT_LIMIT } from '@/lib/vacancy-limits';

/** Inline answers of the create call that a field cannot carry; loaded only when one appears, so it stays out of the page's initial JavaScript (PERF-04). */
export function FormAlerts({
  kind,
}: {
  kind: 'draftLimit' | 'verticalUnavailable';
}) {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  return kind === 'draftLimit' ? (
    <FormAlert
      action={
        <Link
          href="/vacancies?status=DRAFT"
          target="_blank"
          rel="noopener"
          className="underline"
        >
          {t('alerts.openDrafts')}
        </Link>
      }
    >
      {tVacancies('createErrors.draftLimitReached', {
        count: VACANCY_DRAFT_LIMIT,
      })}
    </FormAlert>
  ) : (
    <FormAlert>{t('alerts.verticalUnavailable')}</FormAlert>
  );
}

/** The «Додати посаду» link of an empty catalogue (Admin, Head Recruiter); opens in a new tab so the form is not lost. */
export function AddPositionLink() {
  const t = useTranslations('vacancyForm');
  return (
    <Link
      href="/vacancies/positions"
      target="_blank"
      rel="noopener"
      className="text-link underline"
    >
      {t('position.add')}
    </Link>
  );
}

/** Fades in after 150 ms inside the button padding, so a quick save never flashes and the width never moves; the chunk is loaded long before that. */
export function Busy() {
  return (
    <span
      aria-hidden="true"
      className="skeleton-delayed absolute inset-y-0 left-2 flex items-center"
    >
      <LoaderCircle className="size-3.5 animate-[spin_600ms_linear_infinite]" />
    </span>
  );
}
