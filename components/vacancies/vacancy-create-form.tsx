'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, type KeyboardEvent } from 'react';
import {
  Controller,
  useForm,
  useWatch,
  type FieldError,
  type Resolver,
} from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { FormError } from '@/components/ui/form-error';
import { FormField } from '@/components/ui/form-field';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { UrgencyControl } from '@/components/vacancies/urgency-control';
import { useCreateVacancy } from '@/components/vacancies/use-create-vacancy';
import { usePositionPicker } from '@/components/vacancies/use-position-picker';
import {
  emptyVacancyForm,
  VACANCY_FIELD_IDS,
  type VacancyFormErrorCode,
  type VacancyFormMode,
  type VacancyFormValues,
  type VacancyUrgency,
} from '@/lib/vacancy-form';
import { loadSubmit } from '@/lib/vacancy-form-load';
import type { PositionsSeed } from '@/lib/vacancy-form-submit';
import {
  VACANCY_HEADCOUNT_MAX,
  VACANCY_TITLE_MAX,
  VACANCY_TITLE_MIN,
} from '@/lib/vacancy-limits';

/** Keeps a focused field clear of the sticky footer. */
const CLEARANCE = 'scroll-mb-28';
const URGENCIES: readonly VacancyUrgency[] = ['NORMAL', 'URGENT'];
const TITLE_BOUNDS = { min: VACANCY_TITLE_MIN, max: VACANCY_TITLE_MAX };
const HEADCOUNT_BOUNDS = { min: 1, max: VACANCY_HEADCOUNT_MAX };

const codeOf = (error: FieldError | undefined) =>
  error?.message as VacancyFormErrorCode | undefined;

/** «Нова вакансія», group «Основне» (VAC-01, STORY-VAC-01-1): one create call for both actions, checked by the shared Zod schema. */
export function VacancyCreateForm({
  verticals,
  initialVerticalId,
  initialPositions,
  canManagePositions,
}: {
  verticals: readonly { id: string; name: string }[];
  initialVerticalId: string;
  initialPositions?: PositionsSeed;
  canManagePositions: boolean;
}) {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  const tCommon = useTranslations('common');
  const guard = useRef<LeaveGuardHandle>(null);
  const mode = useRef<VacancyFormMode>('DRAFT');
  // Blur validation follows the last pressed action, so a publish-only error does not show while a draft is being filled in.
  const resolver = useCallback<Resolver<VacancyFormValues>>(async (values) => {
    try {
      return (await loadSubmit()).resolveVacancyForm(values, mode.current);
    } catch {
      // No module, no field rules; the press that submits reports the failure.
      return { values, errors: {} };
    }
  }, []);
  const form = useForm<VacancyFormValues>({
    resolver,
    mode: 'onTouched',
    shouldFocusError: false,
    defaultValues: emptyVacancyForm(initialVerticalId),
  });
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors, isDirty },
  } = form;
  const verticalId = useWatch({ control, name: 'verticalId' });
  const title = useWatch({ control, name: 'title' });
  const {
    submit,
    pendingMode,
    pending,
    lib,
    feedback,
    alert,
    clearAlert,
    summary,
    announce,
  } = useCreateVacancy({ form, modeRef: mode, guard });
  const picker = usePositionPicker({
    form: { getValues, setValue, errors },
    verticalId,
    initialVerticalId,
    initialPositions,
    pending,
    onVerticalChange: clearAlert,
  });

  // Until the lazy module loads the back link is the plain list and the title counter counts UTF-16 units.
  const listHref = lib ? lib.rememberedListHref() : '/vacancies';

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      submit('PUBLISH');
      return;
    }
    // Implicit submission would run the first button: a stray Enter must not publish.
    if (event.target instanceof HTMLInputElement) event.preventDefault();
  };

  const errorText = (code: VacancyFormErrorCode | undefined) => {
    if (!code) return undefined;
    if (code === 'positionRequired' || code === 'positionInactive')
      return tVacancies(`draftErrors.${code}`);
    return t(
      `errors.${code}`,
      code === 'headcountRange' ? HEADCOUNT_BOUNDS : TITLE_BOUNDS,
    );
  };

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
    <FormPageLayout
      title={t('title')}
      subtitle={t('subtitle')}
      back={{ href: listHref, label: t('back') }}
      dirty={isDirty}
      guardRef={guard}
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
      footer={
        <>
          <Button asChild variant="outline" className="h-11 md:h-10">
            <Link href={listHref}>{tCommon('cancel')}</Link>
          </Button>
          <Button
            variant="outline"
            aria-busy={pendingMode === 'DRAFT' || undefined}
            aria-disabled={(pending && pendingMode !== 'DRAFT') || undefined}
            className="relative h-11 md:h-10"
            onClick={() => submit('DRAFT')}
          >
            {feedback && pendingMode === 'DRAFT' && <feedback.Busy />}
            {t('actions.saveDraft')}
          </Button>
          <Button
            aria-busy={pendingMode === 'PUBLISH' || undefined}
            aria-disabled={(pending && pendingMode !== 'PUBLISH') || undefined}
            className="relative h-11 md:h-10"
            onClick={() => submit('PUBLISH')}
          >
            {feedback && pendingMode === 'PUBLISH' && <feedback.Busy />}
            {t('actions.create')}
          </Button>
        </>
      }
    >
      <FormError count={summary.count} attempt={summary.attempt} />
      <section
        aria-labelledby="vacancy-form-basics"
        className="flex flex-col gap-6"
      >
        <h2
          id="vacancy-form-basics"
          className="text-foreground border-border border-b pb-2 text-base font-semibold"
        >
          {t('basics')}
        </h2>
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
                  error={errorText(codeOf(fieldState.error))}
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
                picker.verticalNote
                  ? 'text-muted-foreground mt-1.5 text-xs'
                  : 'text-muted-foreground text-xs'
              }
            >
              {picker.verticalNote ? t('vertical.reset') : null}
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
                error={errorText(codeOf(fieldState.error))}
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
                    disabled={!verticalId}
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
          error={errorText(codeOf(errors.title))}
          announce={announce}
          counter={{
            count: lib ? lib.serverTextLength(title) : title.length,
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
            error={errorText(codeOf(errors.headcount))}
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
      </section>
      {alert && feedback && <feedback.FormAlerts kind={alert} />}
    </FormPageLayout>
  );
}
