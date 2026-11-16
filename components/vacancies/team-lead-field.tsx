'use client';

import { useTranslations } from 'next-intl';
import { Controller, type Control } from 'react-hook-form';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { VACANCY_FIELD_CLEARANCE } from '@/components/vacancies/vacancy-form-skeleton';
import { VACANCY_FIELD_IDS, type VacancyFormValues } from '@/lib/vacancy-form';

/** «Тімлід» (`vacancy.team_lead.set`: Admin, Head Recruiter); optional, so it can be cleared back to «Без тімліда». */
export function TeamLeadField({
  control,
  verticalId,
  error,
  announce,
  empty,
  readOnly,
  onSearch,
  onValueChange,
}: {
  control: Control<VacancyFormValues>;
  verticalId: string;
  error: string | undefined;
  announce: boolean;
  empty: boolean;
  readOnly: boolean;
  onSearch: (query: string) => Promise<readonly ComboboxOption[]>;
  onValueChange: (id: string) => void;
}) {
  const t = useTranslations('vacancyForm');
  return (
    <Controller
      control={control}
      name="teamLeadId"
      render={({ field }) => (
        <FormField
          id={VACANCY_FIELD_IDS.teamLeadId}
          label={t('teamLead.label')}
          hint={t('teamLead.hint')}
          error={error}
          announce={announce}
        >
          {(props) => (
            <Combobox
              {...props}
              // A new vertical is a new list: remount so no Team Lead of the old one is shown.
              key={verticalId}
              className={VACANCY_FIELD_CLEARANCE}
              value={field.value}
              clearable
              disabled={!verticalId}
              readOnly={readOnly}
              placeholder={t(
                verticalId ? 'teamLead.placeholder' : 'position.needVertical',
              )}
              emptyText={empty ? t('teamLead.empty') : undefined}
              onSearch={onSearch}
              onValueChange={onValueChange}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      )}
    />
  );
}
