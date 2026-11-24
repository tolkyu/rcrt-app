'use client';

import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FORM_COLUMN_WIDTH } from '@/components/ui/form-rail';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import { AfterCreateNote } from '@/components/vacancies/readiness-rail';
import { useVacancyErrorText } from '@/components/vacancies/use-vacancy-error-text';
import { VacancyConditionsGroup } from '@/components/vacancies/vacancy-conditions-group';
import {
  vacancyAfterCreateSkeleton,
  vacancyConditionsSkeleton,
} from '@/components/vacancies/vacancy-form-skeleton';
import { emptyVacancyForm, type VacancyFormValues } from '@/lib/vacancy-form';

function Sample({
  label,
  slot,
  children,
}: {
  label: string;
  slot: string;
  children: ReactNode;
}) {
  return (
    <div data-slot={slot} className="w-full min-w-0">
      <p className="text-muted-foreground mb-2 text-xs font-medium">{label}</p>
      <div className={FORM_COLUMN_WIDTH}>{children}</div>
    </div>
  );
}

/** The real group and note in the real page frame, so the skeleton is measured against the production markup and copy. */
function LoadedConditions({
  withProbation,
  title,
  subtitle,
  back,
}: {
  withProbation: boolean;
  title: string;
  subtitle: string;
  back: { href: string; label: string };
}) {
  const t = useTranslations('devUi.pageFrame');
  const fieldError = useVacancyErrorText();
  const {
    control,
    register,
    setValue,
    trigger,
    getFieldState,
    formState: { errors },
  } = useForm<VacancyFormValues>({
    defaultValues: emptyVacancyForm('', withProbation),
  });
  return (
    <FormPageLayout
      title={title}
      subtitle={subtitle}
      back={back}
      dirty={false}
      onSubmit={(event) => event.preventDefault()}
      footer={
        <>
          <Button variant="ghost" className="h-11 md:h-10">
            {t('formCancel')}
          </Button>
          <Button variant="outline" className="h-11 md:h-10">
            {t('formSave')}
          </Button>
          <Button type="submit" className="h-11 md:h-10">
            {t('formCreate')}
          </Button>
        </>
      }
    >
      <VacancyConditionsGroup
        control={control}
        register={register}
        setValue={setValue}
        trigger={trigger}
        getFieldState={getFieldState}
        errors={errors}
        fieldError={fieldError}
        announce
        pending={false}
        showProbation={withProbation}
        normalizeSalary={undefined}
      />
      <AfterCreateNote assigner={withProbation} />
    </FormPageLayout>
  );
}

/** Skeleton and loaded twins of group «Умови» for the Admin (probation field, assigner note) and a Recruiter (read-only line, self note). */
export function ConditionsSkeletonDemos() {
  const t = useTranslations('devUi.pageFrame');
  const back = { href: '/dev/ui', label: t('formBack') };
  const variants = [
    {
      key: 'admin',
      withProbation: true,
      skeletonLabel: t('conditionsAdminSkeletonLabel'),
      loadedLabel: t('conditionsAdminLoadedLabel'),
    },
    {
      key: 'recruiter',
      withProbation: false,
      skeletonLabel: t('conditionsRecruiterSkeletonLabel'),
      loadedLabel: t('conditionsRecruiterLoadedLabel'),
    },
  ] as const;
  return variants.map(({ key, withProbation, skeletonLabel, loadedLabel }) => (
    <Fragment key={key}>
      <Sample label={skeletonLabel} slot={`conditions-skeleton-${key}`}>
        <FormSkeleton
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
          fields={[
            ...vacancyConditionsSkeleton(withProbation),
            vacancyAfterCreateSkeleton(withProbation),
          ]}
        />
      </Sample>
      <Sample label={loadedLabel} slot={`conditions-loaded-${key}`}>
        <LoadedConditions
          withProbation={withProbation}
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
        />
      </Sample>
    </Fragment>
  ));
}
