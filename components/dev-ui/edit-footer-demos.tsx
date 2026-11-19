'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Combobox } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { FORM_COLUMN_WIDTH } from '@/components/ui/form-rail';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import { Select } from '@/components/ui/select';
import { EditFormActions } from '@/components/vacancies/edit-form-actions';
import {
  EDIT_BUTTON_WIDTHS,
  vacancyFormSkeleton,
} from '@/components/vacancies/vacancy-form-skeleton';
import { VACANCY_FIELD_IDS } from '@/lib/vacancy-form';

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

/** The locked-vertical row exactly as `VacancyBasicsGroup` draws it in the edit form (vertical, its fixed hint, position with its hint). */
function LoadedVerticalRow() {
  const t = useTranslations('vacancyForm');
  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <div className="min-w-0">
        <FormField
          id={VACANCY_FIELD_IDS.verticalId}
          label={t('vertical.label')}
          required
        >
          {(props) => (
            <Select
              {...props}
              options={[{ value: 'g', label: t('vertical.placeholder') }]}
              value="g"
              disabled
              onValueChange={() => undefined}
            />
          )}
        </FormField>
        <p role="status" className="text-muted-foreground mt-1.5 text-xs">
          {t('edit.verticalLocked')}
        </p>
      </div>
      <FormField
        id={VACANCY_FIELD_IDS.positionId}
        label={t('position.label')}
        required
        hint={t('position.hint')}
        className="min-w-0"
      >
        {(props) => (
          <Combobox
            {...props}
            options={[]}
            value=""
            placeholder={t('position.placeholder')}
            onValueChange={() => undefined}
          />
        )}
      </FormField>
    </div>
  );
}

/** The edit form's footer with the real buttons beside its loading twin, so the measured widths are checked against production markup and copy. */
export function EditFooterDemos() {
  const t = useTranslations('devUi.pageFrame');
  const back = { href: '/dev/ui', label: t('formBack') };
  return (
    <>
      <Sample
        label={t('editFooterSkeletonLabel')}
        slot="edit-footer-skeleton-sample"
      >
        <FormSkeleton
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
          fields={[]}
          buttonWidths={EDIT_BUTTON_WIDTHS}
        />
      </Sample>
      <Sample
        label={t('editFooterLoadedLabel')}
        slot="edit-footer-loaded-sample"
      >
        <FormPageLayout
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
          dirty={false}
          onSubmit={(event) => event.preventDefault()}
          footer={
            <EditFormActions
              listHref="/dev/ui"
              pendingMode={null}
              feedback={null}
              onSubmit={() => undefined}
            />
          }
        >
          {null}
        </FormPageLayout>
      </Sample>
      <Sample label={t('editRowSkeletonLabel')} slot="edit-row-skeleton-sample">
        <FormSkeleton
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
          fields={[
            vacancyFormSkeleton({
              withTeamLead: false,
              withProbation: false,
              lockedVertical: true,
            })[1]!,
          ]}
          buttonWidths={EDIT_BUTTON_WIDTHS}
        />
      </Sample>
      <Sample label={t('editRowLoadedLabel')} slot="edit-row-loaded-sample">
        <FormPageLayout
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
          dirty={false}
          onSubmit={(event) => event.preventDefault()}
          footer={
            <EditFormActions
              listHref="/dev/ui"
              pendingMode={null}
              feedback={null}
              onSubmit={() => undefined}
            />
          }
        >
          <LoadedVerticalRow />
        </FormPageLayout>
      </Sample>
    </>
  );
}
