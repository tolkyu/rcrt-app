'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { toast, type ToastTone } from '@/lib/toast';
import { GalleryGroup } from './gallery-section';

const TONES: readonly ToastTone[] = ['success', 'info', 'warning', 'error'];

function DialogDemo() {
  const t = useTranslations('devUi.toasts');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [select, setSelect] = useState('');
  const [combobox, setCombobox] = useState('');
  const options = [
    { value: 'gambling', label: t('optionGambling') },
    { value: 'crypto', label: t('optionCrypto') },
  ];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('dialogOpen')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tCommon('close')}>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
          <Button
            variant="secondary"
            onClick={() =>
              toast.success(t('dialogToast'), {
                description: t('dialogToastDescription'),
                action: { label: t('open'), onAction: () => undefined },
              })
            }
          >
            {t('dialogRaise')}
          </Button>
          <FormField id="toast-demo-select" label={t('selectLabel')}>
            {(control) => (
              <Select
                {...control}
                value={select}
                onValueChange={setSelect}
                placeholder={t('placeholder')}
                options={options}
              />
            )}
          </FormField>
          <FormField id="toast-demo-combobox" label={t('comboboxLabel')}>
            {(control) => (
              <Combobox
                {...control}
                value={combobox}
                onValueChange={setCombobox}
                placeholder={t('placeholder')}
                options={options}
              />
            )}
          </FormField>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{t('menuLabel')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>{t('optionGambling')}</DropdownMenuItem>
              <DropdownMenuItem>{t('optionCrypto')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ToastDemos() {
  const t = useTranslations('devUi.toasts');
  const [actions, setActions] = useState(0);
  const countAction = () => setActions((count) => count + 1);
  return (
    <>
      <GalleryGroup title={t('tones')} hint={t('tonesHint')}>
        {TONES.map((tone) => (
          <Button
            key={tone}
            variant="outline"
            onClick={() =>
              toast[tone](t(`${tone}Title`), {
                description: t(`${tone}Description`),
              })
            }
          >
            {t(tone)}
          </Button>
        ))}
      </GalleryGroup>
      <GalleryGroup title={t('titleOnly')}>
        {TONES.map((tone) => (
          <Button
            key={tone}
            variant="outline"
            onClick={() => toast[tone](t(`${tone}Title`))}
          >
            {t(tone)}
          </Button>
        ))}
      </GalleryGroup>
      <GalleryGroup title={t('action')} hint={t('actionHint')}>
        <Button
          variant="outline"
          onClick={() =>
            toast.success(t('successTitle'), {
              description: t('successDescription'),
              action: { label: t('open'), onAction: countAction },
            })
          }
        >
          {t('withAction')}
        </Button>
        <span className="text-muted-foreground text-sm">
          {t('actionCount', { count: actions })}
        </span>
      </GalleryGroup>
      <GalleryGroup title={t('dedupe')} hint={t('dedupeHint')}>
        <Button
          variant="outline"
          onClick={() =>
            toast.warning(t('staleTitle'), {
              description: t('staleDescription'),
              id: 'stale:vacancy:demo',
            })
          }
        >
          {t('stale')}
        </Button>
      </GalleryGroup>
      <GalleryGroup title={t('worst')} hint={t('worstHint')}>
        <Button
          variant="outline"
          onClick={() =>
            toast.error(t('longTitle'), {
              description: t('longDescription'),
              action: { label: t('retry'), onAction: countAction },
            })
          }
        >
          {t('long')}
        </Button>
      </GalleryGroup>
      <GalleryGroup title={t('layers')} hint={t('layersHint')}>
        <DialogDemo />
      </GalleryGroup>
    </>
  );
}
