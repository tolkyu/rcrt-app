'use client';

import { useTranslations } from 'next-intl';
import {
  Controller,
  type Control,
  type FieldError,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { FormGroup } from '@/components/ui/form-group';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TeamLeadField } from '@/components/vacancies/team-lead-field';
import { UrgencyControl } from '@/components/vacancies/urgency-control';
import type { useVacancyPickers } from '@/components/vacancies/use-vacancy-pickers';
import { VACANCY_FIELD_CLEARANCE as CLEARANCE } from '@/components/vacancies/vacancy-form-classes';
import {
  VACANCY_FIELD_IDS,
  type VacancyFormValues,
  type VacancyUrgency,
} from '@/lib/vacancy-form';
import type { FeedbackModule } from '@/lib/vacancy-form-load';
import { VACANCY_TITLE_MAX } from '@/lib/vacancy-limits';

const URGENCIES: readonly VacancyUrgency[] = ['NORMAL', 'URGENT'];
const RESET_NOTES = {
  position: 'vertical.resetPosition',
  teamLead: 'vertical.resetTeamLead',
  both: 'vertical.resetBoth',
} as const;

/** Group «Основне» of the create form: vertical, position, title, headcount, urgency and (Admin, Head Recruiter) the Team Lead. */
export function VacancyBasicsGroup({
  control,
  register,
  errors,
  fieldError,
  announce,
  pending,
  verticals,
  verticalId,
  title,
  titleLength,
  picker,
  showTeamLead,
  canManagePositions,
  feedback,
  lockedVertical = false,
  selectedPosition,
  selectedTeamLead,
}: {
  control: Control<VacancyFormValues>;
  register: UseFormRegister<VacancyFormValues>;
  errors: FieldErrors<VacancyFormValues>;
  fieldError: (error: FieldError | undefined) => string | undefined;
  announce: boolean;
  pending: boolean;
  verticals: readonly { id: string; name: string }[];
  verticalId: string;
  title: string;
  /** Characters the server counts; the same number feeds the counter and the readiness rail. */
  titleLength: number;
  picker: ReturnType<typeof useVacancyPickers>;
  showTeamLead: boolean;
  canManagePositions: boolean;
  feedback: FeedbackModule | null;
  /** A saved draft keeps its vertical (Q-185): the select stays disabled and says why. */
  lockedVertical?: boolean;
  /** The saved draft's own position and Team Lead, so the fields show them before any list loads. */
  selectedPosition?: ComboboxOption;
  selectedTeamLead?: ComboboxOption;
}) {
  const t = useTranslations('vacancyForm');
  const autoFilled = picker.autoTitle !== '' && title === picker.autoTitle;
  const positionHint = picker.catalogEmpty ? (
    canManagePositions && feedback ? (
      <feedback.AddPositionLink />
    ) : (
      t('position.askHead')
    )
  ) : (
    t('position.hint')
  );
  return (
    <FormGroup id="vacancy-form-basics" title={t('basics')}>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <Controller
            control={control}
            name="verticalId"
            render={({ field, fieldState }) => (
              <FormField
                id={VACANCY_FIELD_IDS.verticalId}
                label={t('vertical.label')}
                required
                error={fieldError(fieldState.error)}
                announce={announce}
              >
                {(props) => (
                  <Select
                    {...props}
                    className={CLEARANCE}
                    options={verticals.map((vertical) => ({
                      value: vertical.id,
                      label: vertical.name,
                    }))}
                    value={field.value}
                    placeholder={t('vertical.placeholder')}
                    disabled={verticals.length === 1}
                    onValueChange={picker.chooseVertical}
                    onBlur={field.onBlur}
                  />
                )}
              </FormField>
            )}
          />
          <p
            role="status"
            className={
              lockedVertical || picker.verticalNote
                ? 'text-muted-foreground mt-1.5 text-xs'
                : 'text-muted-foreground text-xs'
            }
          >
            {lockedVertical
              ? t('edit.verticalLocked')
              : picker.verticalNote
                ? t(RESET_NOTES[picker.verticalNote])
                : null}
          </p>
        </div>
        <Controller
          control={control}
          name="positionId"
          render={({ field, fieldState }) => (
            <FormField
              id={VACANCY_FIELD_IDS.positionId}
              label={t('position.label')}
              required
              hint={positionHint}
              error={fieldError(fieldState.error)}
              announce={announce}
              className="min-w-0"
            >
              {(props) => (
                <Combobox
                  {...props}
                  // A new vertical is a new list: remount so no result of the old one is shown.
                  key={verticalId}
                  className={CLEARANCE}
                  value={field.value}
                  selectedOption={selectedPosition}
                  disabled={!verticalId}
                  readOnly={pending}
                  placeholder={t(
                    verticalId
                      ? 'position.placeholder'
                      : 'position.needVertical',
                  )}
                  emptyText={
                    picker.catalogEmpty ? t('position.empty') : undefined
                  }
                  onSearch={picker.searchPositions}
                  onValueChange={picker.choosePosition}
                  onBlur={field.onBlur}
                />
              )}
            </FormField>
          )}
        />
      </div>
      <FormField
        id={VACANCY_FIELD_IDS.title}
        label={t('titleField.label')}
        required
        hint={autoFilled ? t('titleField.autoHint') : t('titleField.hint')}
        error={fieldError(errors.title)}
        announce={announce}
        counter={{
          count: titleLength,
          max: VACANCY_TITLE_MAX,
        }}
      >
        {(props) => (
          <Input
            {...props}
            {...register('title')}
            className={CLEARANCE}
            autoComplete="off"
            enterKeyHint="next"
            readOnly={pending}
          />
        )}
      </FormField>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <FormField
          id={VACANCY_FIELD_IDS.headcount}
          label={t('headcount.label')}
          required
          hint={t('headcount.hint')}
          error={fieldError(errors.headcount)}
          announce={announce}
          className="min-w-0"
        >
          {(props) => (
            <Input
              {...props}
              {...register('headcount')}
              className={CLEARANCE}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="next"
              readOnly={pending}
            />
          )}
        </FormField>
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <FormField
              id="vacancy-form-priority"
              layout="group"
              label={t('priority.label')}
              hint={t('priority.hint')}
              className="min-w-0"
            >
              {(props) => (
                <UrgencyControl
                  {...props}
                  options={URGENCIES.map((value) => ({
                    value,
                    label: t(`priority.${value}`),
                  }))}
                  value={field.value}
                  disabled={pending}
                  onValueChange={(value) => {
                    const urgency = URGENCIES.find((item) => item === value);
                    if (urgency) field.onChange(urgency);
                  }}
                  onBlur={field.onBlur}
                />
              )}
            </FormField>
          )}
        />
      </div>
      {showTeamLead && (
        <TeamLeadField
          control={control}
          verticalId={verticalId}
          error={fieldError(errors.teamLeadId)}
          announce={announce}
          empty={picker.teamLeadsEmpty}
          readOnly={pending}
          selectedOption={selectedTeamLead}
          onSearch={picker.searchTeamLeads}
          onValueChange={picker.chooseTeamLead}
        />
      )}
    </FormGroup>
  );
}
