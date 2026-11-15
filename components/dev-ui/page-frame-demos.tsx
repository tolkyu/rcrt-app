'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <GalleryGroup title={t('formGroup')} hint={t('formHint')}>
        <FormDemo />
      </GalleryGroup>
    </>
  );
}

function FormDemo() {
  const t = useTranslations('devUi.pageFrame');
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [note, setNote] = useState<string>();
  const dirty = value !== saved;
  const save = () => {
    setSaved(value);
    setNote(t('formSaved'));
  };
  return (
    <div data-slot="form-page-demo" className="w-full min-w-0">
      <FormPageLayout
        title={t('formTitle')}
        subtitle={t('formSubtitle')}
        back={{ href: '/dev/ui?left=form', label: t('formBack') }}
        dirty={dirty}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        footer={
          <>
            <Button variant="ghost" asChild>
              <Link href="/dev/ui?left=form">{t('formCancel')}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={save}>
              {t('formSave')}
            </Button>
            <Button type="submit">{t('formCreate')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="page-frame-title">{t('formField')}</Label>
          <Input
            id="page-frame-title"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setNote(undefined);
            }}
          />
        </div>
        <p role="status" className="text-muted-foreground text-sm">
          {note ?? (dirty ? t('formDirty') : t('formClean'))}
        </p>
      </FormPageLayout>
    </div>
  );
}
