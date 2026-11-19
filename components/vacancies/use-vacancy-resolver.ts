import { useCallback, type RefObject } from 'react';
import type { Resolver } from 'react-hook-form';
import type {
  FilledField,
  VacancyFormMode,
  VacancyFormValues,
} from '@/lib/vacancy-form';
import { loadSubmit } from '@/lib/vacancy-form-load';

/** Blur validation follows the last pressed action, so a publish-only error does not show while a draft is being filled in. */
export function useVacancyResolver(
  mode: RefObject<VacancyFormMode>,
  filled?: readonly FilledField[],
) {
  return useCallback<Resolver<VacancyFormValues>>(
    async (values) => {
      try {
        return (await loadSubmit()).resolveVacancyForm(
          values,
          mode.current,
          filled,
        );
      } catch {
        // No module, no field rules; the press that submits reports the failure.
        return { values, errors: {} };
      }
    },
    [mode, filled],
  );
}
