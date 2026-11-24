'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { ComboboxOption } from '@/components/ui/combobox';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { FormRailLayout } from '@/components/ui/form-rail';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { useEditSubtitle } from '@/components/vacancies/edit-subtitle';
import { EditFormActions } from '@/components/vacancies/edit-form-actions';
import {
  AfterCreateNote,
  ReadinessRail,
} from '@/components/vacancies/readiness-rail';
import {
  FILLED_FIELDS,
  FILLED_FIELDS_WITH_PROBATION,
  useEditVacancy,
} from '@/components/vacancies/use-edit-vacancy';
import { useVacancyErrorText } from '@/components/vacancies/use-vacancy-error-text';
import { useVacancyPickers } from '@/components/vacancies/use-vacancy-pickers';
import { useVacancyResolver } from '@/components/vacancies/use-vacancy-resolver';
import { VacancyBasicsGroup } from '@/components/vacancies/vacancy-basics-group';
import { VacancyConditionsGroup } from '@/components/vacancies/vacancy-conditions-group';
import { VacancyFormContentSlot } from '@/components/vacancies/vacancy-form-content-slot';
import { VacancyFormError } from '@/components/vacancies/vacancy-form-error';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import type {
  ContentDocs,
  FormContentHandle,
} from '@/lib/vacancy-content-form';
import { vacancyFormValues } from '@/lib/vacancy-edit-form';
import {
  isTitleLengthReady,
  probationFieldShown,
  teamLeadFieldShown,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import type { PositionsSeed } from '@/lib/vacancy-form-submit';

const NO_VERTICAL_CHANGE = () => undefined;

/** «Редагування чернетки» (VAC-01, STORY-VAC-01-1): the create form's groups on a saved draft; Save sends only the changed fields, Publish saves them first. */
export function VacancyEditForm({
  vacancy,
  initialContent,
  vertical,
  initialPositions,
  canManagePositions,
}: {
  vacancy: VacancyDetail;
  initialContent: ContentDocs;
  vertical: {
    id: string;
    name: string;
    canSetTeamLead: boolean;
    canSetProbation: boolean;
  };
  initialPositions?: PositionsSeed;
  canManagePositions: boolean;
}) {
  const t = useTranslations('vacancyForm');
  const fieldError = useVacancyErrorText();
  const guard = useRef<LeaveGuardHandle>(null);
  const mode = useRef<VacancyFormMode>('DRAFT');
  const content = useRef<FormContentHandle | null>(null);
  const [contentDirty, setContentDirty] = useState(false);
  const verticals = [vertical];
  const showTeamLead = teamLeadFieldShown(verticals, vertical.id);
  const showProbation = probationFieldShown(verticals, vertical.id);
  const form = useForm<VacancyFormValues>({
    resolver: useVacancyResolver(
      mode,
      showProbation ? FILLED_FIELDS_WITH_PROBATION : FILLED_FIELDS,
    ),
    mode: 'onTouched',
    shouldFocusError: false,
    defaultValues: vacancyFormValues(vacancy, showProbation),
  });
  const {
    control,
    register,
    setValue,
    getValues,
    trigger,
    getFieldState,
    formState: { errors, isDirty },
  } = form;
  const title = useWatch({ control, name: 'title' });
  const positionId = useWatch({ control, name: 'positionId' });
  const edit = useEditVacancy({
    form,
    modeRef: mode,
    guard,
    vacancy,
    initialContent,
    content,
    shown: { teamLead: showTeamLead, probation: showProbation },
  });
  const { baseline, lib, feedback, pending } = edit;
  const subtitle = useEditSubtitle(baseline);
  const picker = useVacancyPickers({
    form: { getValues, setValue, errors },
    verticalId: vertical.id,
    verticalName: vertical.name,
    initialVerticalId: vertical.id,
    initialPositions,
    pending,
    onVerticalChange: NO_VERTICAL_CHANGE,
  });

  // Until the lazy module loads the back link is the plain list and the title counter counts UTF-16 units.
  const listHref = lib ? lib.rememberedListHref() : '/vacancies';
  const titleLength = lib ? lib.serverTextLength(title) : title.length;
  const selectedPosition: ComboboxOption | undefined = baseline.position
    ? { value: baseline.position.id, label: baseline.position.name }
    : undefined;
  const selectedTeamLead: ComboboxOption | undefined = baseline.teamLead
    ? {
        value: baseline.teamLead.id,
        label: baseline.teamLead.fullName,
        avatar: true,
      }
    : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      edit.submit('PUBLISH');
      return;
    }
    // Implicit submission would run the first button: a stray Enter must not publish.
    if (event.target instanceof HTMLInputElement) event.preventDefault();
  };

  return (
    <FormPageLayout
      title={t('edit.title')}
      subtitle={subtitle}
      back={{ href: listHref, label: t('back') }}
      dirty={isDirty || contentDirty}
      guardRef={guard}
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
      footer={
        <EditFormActions
          listHref={listHref}
          pendingMode={edit.pendingMode}
          locked={edit.reloading}
          feedback={feedback}
          onSubmit={edit.submit}
        />
      }
    >
      <FormRailLayout
        rail={
          <ReadinessRail
            ready={{
              vertical: true,
              title: isTitleLengthReady(titleLength),
              position: positionId !== '',
            }}
            assigner={showTeamLead}
          />
        }
      >
        {edit.stale && edit.staleUi && (
          <edit.staleUi.StaleAlert
            dirty={isDirty || contentDirty}
            busy={pending}
            onReload={() => void edit.reloadLatest()}
          />
        )}
        <VacancyFormError summary={edit.summary} />
        <VacancyBasicsGroup
          control={control}
          register={register}
          errors={errors}
          fieldError={fieldError}
          announce={edit.announce}
          pending={pending}
          verticals={verticals}
          verticalId={vertical.id}
          title={title}
          titleLength={titleLength}
          picker={picker}
          showTeamLead={showTeamLead}
          canManagePositions={canManagePositions}
          feedback={feedback}
          lockedVertical
          selectedPosition={selectedPosition}
          selectedTeamLead={selectedTeamLead}
        />
        <VacancyConditionsGroup
          control={control}
          register={register}
          setValue={setValue}
          trigger={trigger}
          getFieldState={getFieldState}
          errors={errors}
          fieldError={fieldError}
          announce={edit.announce}
          pending={pending}
          showProbation={showProbation}
          normalizeSalary={lib?.normalizeSalaryText}
        />
        <VacancyFormContentSlot
          baseline={edit.contentBaseline}
          disabled={pending}
          onDirtyChange={setContentDirty}
          handleRef={content}
        />
        <AfterCreateNote assigner={showTeamLead} />
      </FormRailLayout>
    </FormPageLayout>
  );
}
