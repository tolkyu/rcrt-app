'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import {
  RowActionsMenu,
  type RowAction,
} from '@/components/ui/row-actions-menu';
import { GalleryGroup } from './gallery-section';

export function PageFrameDemos() {
  const t = useTranslations('devUi.pageFrame');
  const [frame, setFrame] = useState(false);
  const [chosen, setChosen] = useState<string>();
  const actions = useMemo<RowAction[]>(
    () =>
      [
        { id: 'delete', label: t('delete'), destructive: true },
        { id: 'edit', label: t('edit') },
        { id: 'cancel', label: t('cancel'), destructive: true },
        {
          id: 'publish',
          label: t('publish'),
          disabledReason: t('publishReason'),
        },
      ].map((action) => ({
        ...action,
        onSelect: () => setChosen(action.label),
      })),
    [t],
  );
  return (
    <>
      <GalleryGroup title={t('headerGroup')} hint={t('headerHint')}>
        <Button
          variant="outline"
          className="self-start"
          aria-pressed={frame}
          onClick={() => setFrame(!frame)}
        >
          {t('showFrame')}
        </Button>
        {frame && (
          <div data-slot="page-frame-demo" className="w-full min-w-0">
            <PageHeader
              title={t('headerTitle')}
              subtitle={t('headerSubtitle')}
              actions={<Button variant="outline">{t('secondary')}</Button>}
              primary={
                <Button>
                  <Plus aria-hidden="true" />
                  {t('primary')}
                </Button>
              }
            />
          </div>
        )}
      </GalleryGroup>
      <GalleryGroup title={t('menuGroup')} hint={t('menuHint')}>
        <div
          data-slot="row-actions-demo"
          className="border-border flex w-full min-w-0 items-start gap-3 rounded-lg border p-3"
        >
          <p className="min-w-0 flex-1 text-sm font-medium break-words">
            {t('rowTitle')}
          </p>
          <RowActionsMenu
            label={t('rowMenu', { title: t('rowTitle') })}
            actions={actions}
          />
        </div>
        <p role="status" className="text-muted-foreground text-sm">
          {chosen ? t('chosen', { action: chosen }) : t('nothingChosen')}
        </p>
      </GalleryGroup>
    </>
  );
}
