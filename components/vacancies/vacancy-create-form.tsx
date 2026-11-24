'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { FormRailLayout } from '@/components/ui/form-rail';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { CreateFormActions } from '@/components/vacancies/create-form-actions';
import {
  AfterCreateNote,
  ReadinessRail,
} from '@/components/vacancies/readiness-rail';
import { useCreateVacancy } from '@/components/vacancies/use-create-vacancy';
import { useVacancyErrorText } from '@/components/vacancies/use-vacancy-error-text';
import { useVacancyResolver } from '@/components/vacancies/use-vacancy-resolver';
import { VacancyBasicsGroup } from '@/components/vacancies/vacancy-basics-group';
import { VacancyFormError } from '@/components/vacancies/vacancy-form-error';
import { useVacancyPickers } from '@/components/vacancies/use-vacancy-pickers';
import { VacancyConditionsGroup } from '@/components/vacancies/vacancy-conditions-group';
import {
  emptyVacancyForm,
  isTitleLengthReady,
  probationFieldShown,
  teamLeadFieldShown,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import type { PositionsSeed } from '@/lib/vacancy-form-submit';

/** «Нова вакансія», groups «Основне» and «Умови» (VAC-01, STORY-VAC-01-1): one create call for both actions, checked by the shared Zod schema. */
export function VacancyCreateForm({
  verticals,
  initialVerticalId,
  initialPositions,
  initialDraftCount,
  canManagePositions,
}: {
  verticals: readonly {
    id: string;
    name: string;
    canSetTeamLead: boolean;
    canSetProbation: boolean;
  }[];
  initialVerticalId: string;
  initialPositions?: PositionsSeed;
  initialDraftCount?: number;
  canManagePositions: boolean;
}) {
  const t = useTranslations('vacancyForm');
  const fieldError = useVacancyErrorText();
  const guard = useRef<LeaveGuardHandle>(null);
  const mode = useRef<VacancyFormMode>('DRAFT');
  const form = useForm<VacancyFormValues>({
    resolver: useVacancyResolver(mode),
    mode: 'onTouched',
    shouldFocusError: false,
    defaultValues: emptyVacancyForm(
      initialVerticalId,
      probationFieldShown(verticals, initialVerticalId),
    ),
  });
  const {
    control,
    register,
    getValues,
    setValue,
    trigger,
    getFieldState,
    formState: { errors, isDirty },
  } = form;
  const verticalId = useWatch({ control, name: 'verticalId' });
  const title = useWatch({ control, name: 'title' });
  const positionId = useWatch({ control, name: 'positionId' });
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
  const currentVertical = verticals.find(
    (vertical) => vertical.id === verticalId,
  );
  const showTeamLead = teamLeadFieldShown(verticals, verticalId);
  const showProbation = probationFieldShown(verticals, verticalId);
  const picker = useVacancyPickers({
    form: { getValues, setValue, errors },
    verticalId,
    verticalName: currentVertical?.name ?? '',
    initialVerticalId,
    initialPositions,
    pending,
    onVerticalChange: clearAlert,
  });

  // A refreshed grant can take the field away; its value must go with it, so the payload never carries a refused key.
  useEffect(() => {
    if (!showTeamLead && getValues('teamLeadId') !== '')
      setValue('teamLeadId', '', { shouldDirty: true });
  }, [showTeamLead, getValues, setValue]);
  useEffect(() => {
    if (!showProbation && getValues('probationDays') !== '')
      setValue('probationDays', '', { shouldDirty: true });
  }, [showProbation, getValues, setValue]);

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

  // The counter and the readiness tick share one length; until the lazy module loads it counts UTF-16 units.
  const titleLength = lib ? lib.serverTextLength(title) : title.length;

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
        <CreateFormActions
          listHref={listHref}
          pendingMode={pendingMode}
          feedback={feedback}
          draftCount={initialDraftCount}
          onSubmit={submit}
        />
      }
    >
      <FormRailLayout
        rail={
          <ReadinessRail
            ready={{
              vertical: verticalId !== '',
              title: isTitleLengthReady(titleLength),
              position: positionId !== '',
            }}
            assigner={showTeamLead}
          />
        }
      >
        <VacancyFormError summary={summary} />
        <VacancyBasicsGroup
          control={control}
          register={register}
          errors={errors}
          fieldError={fieldError}
          announce={announce}
          pending={pending}
          verticals={verticals}
          verticalId={verticalId}
          title={title}
          titleLength={titleLength}
          picker={picker}
          showTeamLead={showTeamLead}
          canManagePositions={canManagePositions}
          feedback={feedback}
        />
        <VacancyConditionsGroup
          control={control}
          register={register}
          setValue={setValue}
          trigger={trigger}
          getFieldState={getFieldState}
          errors={errors}
          fieldError={fieldError}
          announce={announce}
          pending={pending}
          showProbation={showProbation}
          normalizeSalary={lib?.normalizeSalaryText}
        />
        <AfterCreateNote assigner={showTeamLead} />
        {alert && feedback && <feedback.FormAlerts kind={alert} />}
      </FormRailLayout>
    </FormPageLayout>
  );
}
