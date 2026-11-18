'use client';

import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import { RowSkeleton } from '@/components/vacancies/row-skeleton';
import { VacanciesList } from '@/components/vacancies/vacancies-list';
import { TEAM_LEAD_HINT } from '@/components/vacancies/vacancy-form-skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { FORM_COLUMN_WIDTH } from '@/components/ui/form-rail';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { EditFooterDemos } from './edit-footer-demos';
import { GalleryGroup } from './gallery-section';
import { ConditionsSkeletonDemos } from './vacancy-conditions-demos';

const ignore = () => undefined;

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
      {children}
    </div>
  );
}

export function SkeletonDemos() {
  const t = useTranslations('devUi.pageFrame');
  const back = { href: '/dev/ui', label: t('formBack') };
  const items = useMemo<VacancySummary[]>(() => {
    const vertical = {
      id: '00000000-0000-4000-8000-00000000d001',
      name: t('rowSampleVertical'),
    };
    const teamLead = {
      id: '00000000-0000-4000-8000-00000000d002',
      fullName: t('rowSampleTeamLead'),
      isActive: true,
    };
    const common: Omit<VacancySummary, 'id' | 'number' | 'title' | 'priority'> =
      {
        vertical,
        position: null,
        teamLead,
        recruiters: [],
        status: 'OPEN',
        source: 'APP',
        openedAt: '2026-11-03T08:00:00.000Z',
        createdAt: '2026-11-02T08:00:00.000Z',
        updatedAt: '2026-11-03T08:00:00.000Z',
      };
    return [
      {
        ...common,
        id: '00000000-0000-4000-8000-00000000d101',
        number: 'V-0001',
        title: t('rowSampleTitle'),
        priority: 'NORMAL',
      },
      {
        ...common,
        id: '00000000-0000-4000-8000-00000000d102',
        number: 'V-0002',
        title: t('rowSampleSecondTitle'),
        priority: 'URGENT',
      },
    ];
  }, [t]);
  return (
    <GalleryGroup title={t('skeletonGroup')} hint={t('skeletonHint')}>
      <Sample label={t('rowSkeleton')} slot="row-skeleton-sample">
        <Card className="overflow-hidden p-0">
          <RowSkeleton count={items.length} />
        </Card>
      </Sample>
      <Sample label={t('rowLoaded')} slot="row-loaded-sample">
        <Card className="overflow-hidden p-0">
          <VacanciesList
            items={items}
            selectedId={undefined}
            wide={false}
            onSelect={ignore}
            onPreviewIntent={ignore}
            canAuthorDrafts={false}
            selfAssignVerticals={[]}
          />
        </Card>
      </Sample>
      <Sample label={t('formSkeletonLabel')} slot="form-skeleton-sample">
        <FormSkeleton
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
          back={back}
          fields={['input', 'input', 'textarea']}
        />
      </Sample>
      <Sample label={t('formLoadedLabel')} slot="form-loaded-sample">
        <FormPageLayout
          title={t('sampleTitle')}
          subtitle={t('sampleSubtitle')}
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
          <FormField id="sample-position" label={t('sampleFieldPosition')}>
            {(control) => <Input {...control} />}
          </FormField>
          <FormField id="sample-place" label={t('sampleFieldPlace')}>
            {(control) => <Input {...control} />}
          </FormField>
          <FormField
            id="sample-description"
            label={t('sampleFieldDescription')}
          >
            {(control) => <Textarea {...control} />}
          </FormField>
        </FormPageLayout>
      </Sample>
      <Sample
        label={t('teamLeadSkeletonLabel')}
        slot="team-lead-skeleton-sample"
      >
        <div className={FORM_COLUMN_WIDTH}>
          <FormSkeleton
            title={t('sampleTitle')}
            subtitle={t('sampleSubtitle')}
            back={back}
            fields={[{ kind: 'input', hint: TEAM_LEAD_HINT }]}
          />
        </div>
      </Sample>
      <Sample label={t('teamLeadLoadedLabel')} slot="team-lead-loaded-sample">
        <div className={FORM_COLUMN_WIDTH}>
          <FormPageLayout
            title={t('sampleTitle')}
            subtitle={t('sampleSubtitle')}
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
            <FormField
              id="sample-team-lead"
              label={t('teamLeadFieldLabel')}
              hint={t('teamLeadHint')}
            >
              {(control) => <Input {...control} />}
            </FormField>
          </FormPageLayout>
        </div>
      </Sample>
      <ConditionsSkeletonDemos />
      <EditFooterDemos />
    </GalleryGroup>
  );
}
