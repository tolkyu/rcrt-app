'use client';

import { useTranslations } from 'next-intl';
import type { ChangeEvent, FocusEvent } from 'react';
import {
  Controller,
  type Control,
  type FieldError,
  type FieldErrors,
  type UseFormGetFieldState,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormTrigger,
} from 'react-hook-form';
import { FormField } from '@/components/ui/form-field';
import { FormGroup } from '@/components/ui/form-group';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { VACANCY_FIELD_CLEARANCE } from '@/components/vacancies/vacancy-form-classes';
import { VACANCY_FIELD_IDS, type VacancyFormValues } from '@/lib/vacancy-form';
import {
  VACANCY_EMPLOYMENT_TYPES,
  VACANCY_PROBATION_DEFAULT,
  VACANCY_PROBATION_MAX,
  VACANCY_PROBATION_MIN,
  VACANCY_SALARY_CURRENCIES,
  VACANCY_SENIORITIES,
  VACANCY_WORK_FORMATS,
} from '@/lib/vacancy-options';

type OptionField = 'seniority' | 'workFormat' | 'employmentType';
type SalaryField = 'salaryMin' | 'salaryMax';
/** The three fields whose rules read each other (currency with an amount, maximum against minimum). */
const SALARY_FIELDS = ['salaryMin', 'salaryMax', 'salaryCurrency'] as const;

const SALARY_HINT_ID = 'vacancy-form-salary-hint';

/** Group «Умови» (VAC-01): optional terms, salary range with currency, probation for the Admin (D115) or its read-only line. */
export function VacancyConditionsGroup({
  control,
  register,
  setValue,
  trigger,
  getFieldState,
  errors,
  fieldError,
  announce,
  pending,
  showProbation,
  normalizeSalary,
}: {
  control: Control<VacancyFormValues>;
  register: UseFormRegister<VacancyFormValues>;
  setValue: UseFormSetValue<VacancyFormValues>;
  trigger: UseFormTrigger<VacancyFormValues>;
  getFieldState: UseFormGetFieldState<VacancyFormValues>;
  errors: FieldErrors<VacancyFormValues>;
  fieldError: (error: FieldError | undefined) => string | undefined;
  announce: boolean;
  pending: boolean;
  showProbation: boolean;
  /** Present once the lazy form module has loaded; until then the amount stays as typed. */
  normalizeSalary: ((text: string) => string) | undefined;
}) {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  const notSpecified: SelectOption = {
    value: '',
    label: tVacancies('notSpecified'),
  };
  const labelled = (values: readonly string[]): SelectOption[] => [
    notSpecified,
    ...values.map((value) => ({ value, label: value })),
  ];
  const options: Record<OptionField, SelectOption[]> = {
    seniority: labelled(VACANCY_SENIORITIES),
    employmentType: labelled(VACANCY_EMPLOYMENT_TYPES),
    workFormat: [
      notSpecified,
      ...VACANCY_WORK_FORMATS.map((value) => ({
        value,
        label: tVacancies(`workFormat.${value}`),
      })),
    ],
  };
  const labels: Record<OptionField, string> = {
    seniority: t('seniority.label'),
    workFormat: t('workFormat.label'),
    employmentType: t('employmentType.label'),
  };

  // A salary error that depends on another field must not outlive the edit that fixes it.
  const refreshDependents = (changed: (typeof SALARY_FIELDS)[number]) => {
    const stale = SALARY_FIELDS.filter(
      (name) => name !== changed && getFieldState(name).error,
    );
    if (stale.length > 0) trigger(stale).catch(() => undefined);
  };

  const optionField = (name: OptionField) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField
          id={VACANCY_FIELD_IDS[name]}
          label={labels[name]}
          error={fieldError(fieldState.error)}
          announce={announce}
          className="min-w-0"
        >
          {(props) => (
            <Select
              {...props}
              className={VACANCY_FIELD_CLEARANCE}
              options={options[name]}
              value={field.value}
              onValueChange={(value) => {
                if (!pending) field.onChange(value);
              }}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      )}
    />
  );

  // A valid amount takes its normal form («2 500,5») on blur; one that does not parse stays as typed, so the error points at it.
  const salaryInput = (name: SalaryField) => {
    const field = register(name);
    return {
      ...field,
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        field
          .onChange(event)
          .then(() => refreshDependents(name))
          .catch(() => undefined),
      onBlur: (event: FocusEvent<HTMLInputElement>) => {
        field.onBlur(event).catch(() => undefined);
        const next = normalizeSalary?.(event.target.value);
        if (next !== undefined && next !== event.target.value)
          setValue(name, next, { shouldDirty: true });
      },
    };
  };
  const salaryField = (name: SalaryField, label: string) => (
    <FormField
      id={VACANCY_FIELD_IDS[name]}
      label={label}
      error={fieldError(errors[name])}
      announce={announce}
      className="min-w-0"
    >
      {(props) => (
        <Input
          {...props}
          {...salaryInput(name)}
          className={`${VACANCY_FIELD_CLEARANCE} tabular-nums`}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          readOnly={pending}
        />
      )}
    </FormField>
  );

  return (
    <FormGroup id="vacancy-form-conditions" title={t('conditions')}>
      <div className="grid items-start gap-6 md:grid-cols-2">
        {optionField('seniority')}
        {optionField('workFormat')}
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        {optionField('employmentType')}
        <FormField
          id={VACANCY_FIELD_IDS.location}
          label={t('location.label')}
          error={fieldError(errors.location)}
          announce={announce}
          className="min-w-0"
        >
          {(props) => (
            <Input
              {...props}
              {...register('location')}
              className={VACANCY_FIELD_CLEARANCE}
              placeholder={t('location.placeholder')}
              autoComplete="off"
              enterKeyHint="next"
              readOnly={pending}
            />
          )}
        </FormField>
      </div>
      <fieldset aria-describedby={SALARY_HINT_ID} className="min-w-0">
        <legend className="text-foreground mb-1.5 text-sm font-medium">
          {t('salary.legend')}
        </legend>
        <div className="grid grid-cols-2 items-start gap-6 md:grid-cols-3">
          {salaryField('salaryMin', t('salary.from'))}
          {salaryField('salaryMax', t('salary.to'))}
          <Controller
            control={control}
            name="salaryCurrency"
            render={({ field, fieldState }) => (
              <FormField
                id={VACANCY_FIELD_IDS.salaryCurrency}
                label={t('salary.currency')}
                error={fieldError(fieldState.error)}
                announce={announce}
                className="col-span-2 min-w-0 md:col-span-1"
              >
                {(props) => (
                  <Select
                    {...props}
                    className={VACANCY_FIELD_CLEARANCE}
                    options={[
                      notSpecified,
                      ...VACANCY_SALARY_CURRENCIES.map((currency) => ({
                        value: currency,
                        label: t(`salary.currencies.${currency}`),
                      })),
                    ]}
                    value={field.value}
                    onValueChange={(value) => {
                      if (pending) return;
                      field.onChange(value);
                      refreshDependents('salaryCurrency');
                    }}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
            )}
          />
        </div>
        <p id={SALARY_HINT_ID} className="text-muted-foreground mt-1.5 text-xs">
          {t('salary.hint')}
        </p>
      </fieldset>
      {showProbation ? (
        <div className="grid items-start gap-6 md:grid-cols-2">
          <FormField
            id={VACANCY_FIELD_IDS.probationDays}
            label={t('probation.label')}
            hint={t('probation.hint', {
              min: VACANCY_PROBATION_MIN,
              max: VACANCY_PROBATION_MAX,
              standard: VACANCY_PROBATION_DEFAULT,
            })}
            error={fieldError(errors.probationDays)}
            announce={announce}
            className="min-w-0"
          >
            {(props) => (
              <Input
                {...props}
                {...register('probationDays')}
                className={VACANCY_FIELD_CLEARANCE}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="next"
                readOnly={pending}
              />
            )}
          </FormField>
        </div>
      ) : (
        <p data-slot="form-note" className="text-muted-foreground text-xs">
          {t('probation.readOnly', { days: VACANCY_PROBATION_DEFAULT })}
        </p>
      )}
    </FormGroup>
  );
}
