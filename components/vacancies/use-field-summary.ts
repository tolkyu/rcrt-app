import { useCallback, useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  VACANCY_FIELD_IDS,
  VACANCY_FORM_FIELDS,
  type VacancyFormField,
  type VacancyFormValues,
} from '@/lib/vacancy-form';

export const focusField = (field: VacancyFormField) =>
  document.getElementById(VACANCY_FIELD_IDS[field])?.focus();

/** Moves focus to the first of `invalid` in form order. */
function focusFirstInvalid(invalid: readonly string[]) {
  const first = VACANCY_FORM_FIELDS.find((field) => invalid.includes(field));
  if (first) focusField(first);
}

/** The «Виправте N полів» summary and the first-invalid-field focus both vacancy forms share; `announce` mutes per-field alerts right after a failed submit so the summary is heard once. */
export function useFieldSummary(
  subscribe: UseFormReturn<VacancyFormValues>['subscribe'],
) {
  const [summary, setSummary] = useState({ count: 0, attempt: 0 });
  const [announce, setAnnounce] = useState(true);
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ type }) => {
          if (type === 'change') setAnnounce(true);
        },
      }),
    [subscribe],
  );
  const invalidFields = useCallback((invalid: readonly string[]) => {
    setAnnounce(false);
    setSummary((current) => ({
      count: invalid.length,
      attempt: current.attempt + 1,
    }));
    focusFirstInvalid(invalid);
  }, []);
  const clearSummary = useCallback(
    () => setSummary((current) => ({ ...current, count: 0 })),
    [],
  );
  return {
    summary,
    announce,
    invalidFields,
    focusFirstInvalid,
    clearSummary,
  };
}
