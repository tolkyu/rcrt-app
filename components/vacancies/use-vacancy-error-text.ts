import { useTranslations } from 'next-intl';
import type { FieldError } from 'react-hook-form';
import type { VacancyFormErrorCode } from '@/lib/vacancy-form';
import {
  VACANCY_HEADCOUNT_MAX,
  VACANCY_TITLE_MAX,
  VACANCY_TITLE_MIN,
} from '@/lib/vacancy-limits';
import {
  VACANCY_LOCATION_MAX,
  VACANCY_PROBATION_MAX,
  VACANCY_PROBATION_MIN,
} from '@/lib/vacancy-options';

const TITLE_BOUNDS = { min: VACANCY_TITLE_MIN, max: VACANCY_TITLE_MAX };
/** ICU arguments of the messages that quote a limit, so the copy never hard-codes a number. */
const BOUNDS: Partial<Record<VacancyFormErrorCode, Record<string, number>>> = {
  titleShort: TITLE_BOUNDS,
  titleLong: TITLE_BOUNDS,
  headcountRange: { min: 1, max: VACANCY_HEADCOUNT_MAX },
  locationLong: { max: VACANCY_LOCATION_MAX },
  probationRange: { min: VACANCY_PROBATION_MIN, max: VACANCY_PROBATION_MAX },
};

/** Field error (its message carries the code) → Ukrainian text; the draft-specific codes share the list's copy. */
export function useVacancyErrorText() {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  return (error: FieldError | undefined) => {
    const code = error?.message as VacancyFormErrorCode | undefined;
    if (!code) return undefined;
    if (
      code === 'positionRequired' ||
      code === 'positionInactive' ||
      code === 'teamLeadInvalid'
    )
      return tVacancies(`draftErrors.${code}`);
    return t(`errors.${code}`, BOUNDS[code]);
  };
}
