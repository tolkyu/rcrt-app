import { useCallback, useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import {
  VACANCY_FIELD_IDS,
  VACANCY_FORM_FIELDS,
  type VacancyFormField,
  type VacancyFormValues,
} from '@/lib/vacancy-form';

/** `fields` are the invalid ones in form order; `count` is what the announcement says. */
export interface FieldSummary {
  count: number;
  attempt: number;
  fields: readonly VacancyFormField[];
}

export const focusField = (field: VacancyFormField) =>
  document.getElementById(VACANCY_FIELD_IDS[field])?.focus();

/** Moves focus to the first of `invalid` in form order. */
function focusFirstInvalid(invalid: readonly string[]) {
  const first = VACANCY_FORM_FIELDS.find((field) => invalid.includes(field));
  if (first) focusField(first);
}

/** Both forms announce one submit summary, dismiss its stale count on edits and focus the first invalid field. */
export function useFieldSummary(
  subscribe: UseFormReturn<VacancyFormValues>['subscribe'],
) {
  const [summary, setSummary] = useState<FieldSummary>({
    count: 0,
    attempt: 0,
    fields: [],
  });
  const [announce, setAnnounce] = useState(true);
  const clearSummary = useCallback(
    () =>
      setSummary((current) =>
        current.count === 0 ? current : { ...current, count: 0, fields: [] },
      ),
    [],
  );
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ type }) => {
          if (type === 'change') setAnnounce(true);
          clearSummary();
        },
      }),
    [subscribe, clearSummary],
  );
  const invalidFields = useCallback((invalid: readonly string[]) => {
    setAnnounce(false);
    setSummary((current) => ({
      count: invalid.length,
      attempt: current.attempt + 1,
      fields: VACANCY_FORM_FIELDS.filter((field) => invalid.includes(field)),
    }));
    focusFirstInvalid(invalid);
  }, []);
  return {
    summary,
    announce,
    invalidFields,
    focusFirstInvalid,
    clearSummary,
  };
}
