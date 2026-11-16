'use client';

import { BriefcaseBusiness, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { EmptyState } from '@/components/states/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DetailHeader } from '@/components/ui/detail-header';
import {
  RowActionsMenu,
  type RowAction,
} from '@/components/ui/row-actions-menu';
import { VacancyStatus } from '@/components/vacancies/vacancy-badges';
import { GalleryGroup } from './gallery-section';

const ignore = () => undefined;

export function PreviewHeaderDemos() {
  const t = useTranslations('devUi.pageFrame');
  const menu = useMemo<RowAction[]>(
    () => [
      { id: 'cancel', label: t('cancel'), destructive: true, onSelect: ignore },
    ],
    [t],
  );
  const cases = [
    {
      id: 'normal',
      label: t('previewNormal'),
      title: t('previewTitles.normal'),
      actions: true,
    },
    {
      id: 'long',
      label: t('previewLong'),
      title: t('previewTitles.long'),
      actions: true,
    },
    {
      id: 'max',
      label: t('previewMax'),
      title: t('previewTitles.max'),
      actions: true,
    },
    {
      id: 'unbreakable',
      label: t('previewUnbreakable'),
      title: t('previewTitles.unbreakable'),
      actions: true,
    },
    {
      id: 'markup',
      label: t('previewMarkup'),
      // `<b>` would be parsed as a rich-text tag by the formatter; the title must reach the DOM as typed.
      title: String(t.raw('previewTitles.markup')),
      actions: true,
    },
    {
      id: 'plain',
      label: t('previewNoActions'),
      title: t('previewTitles.normal'),
      actions: false,
    },
  ];
  return (
    <GalleryGroup title={t('previewGroup')} hint={t('previewHint')}>
      <div className="grid w-full min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cases.map(({ id, label, title, actions }) => (
          <div key={id} data-slot="preview-header-demo" data-case={id}>
            <p className="text-muted-foreground mb-2 text-xs font-medium">
              {label}
            </p>
            <Card className="max-w-88 min-w-0 p-4 md:p-5">
              <DetailHeader
                eyebrow={t('previewNumber')}
                title={title}
                badges={<VacancyStatus status="OPEN" />}
                actions={
                  actions ? (
                    <>
                      <Button size="sm" variant="outline" className="h-11">
                        {t('previewEdit')}
                      </Button>
                      <Button size="sm" className="h-11">
                        {t('publish')}
                      </Button>
                      <RowActionsMenu label={t('previewMenu')} actions={menu} />
                    </>
                  ) : undefined
                }
              />
            </Card>
          </div>
        ))}
      </div>
    </GalleryGroup>
  );
}

export function EmptyStateDemos() {
  const t = useTranslations('devUi.pageFrame');
  return (
    <GalleryGroup title={t('emptyGroup')} hint={t('emptyHint')}>
      <div className="grid w-full min-w-0 gap-4 md:grid-cols-2">
        <div data-slot="empty-with-cta">
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            {t('emptyWithCta')}
          </p>
          <Card>
            <EmptyState
              icon={BriefcaseBusiness}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Button className="h-11">
                  <Plus aria-hidden="true" />
                  {t('primary')}
                </Button>
              }
            />
          </Card>
        </div>
        <div data-slot="empty-without-cta">
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            {t('emptyWithoutCta')}
          </p>
          <Card>
            <EmptyState
              icon={BriefcaseBusiness}
              title={t('emptyTitle')}
              description={t('emptyNoRightDescription')}
            />
          </Card>
        </div>
      </div>
    </GalleryGroup>
  );
}
