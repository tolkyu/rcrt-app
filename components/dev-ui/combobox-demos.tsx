'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { filterOptions } from '@/components/ui/combobox-shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { GalleryGroup } from './gallery-section';

const OPEN_FIELD_ID = 'combobox-demo-open';
const SEARCH_DELAY_MS = 400;

interface FieldState {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}

/** Resolves after `ms` (never when `null`) and rejects as soon as the combobox aborts the request. */
const wait = (ms: number | null, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = ms === null ? undefined : setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

function Demo({
  id,
  label,
  initial = '',
  className = 'w-72',
  children,
}: {
  id: string;
  label: string;
  initial?: string;
  className?: string;
  children: (field: FieldState) => ReactNode;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children({ id, value, onValueChange: setValue })}
    </div>
  );
}

function InvalidDemo({ people }: { people: readonly ComboboxOption[] }) {
  const t = useTranslations('devUi.combobox');
  const [value, setValue] = useState('');
  return (
    <FormField
      id="combobox-demo-invalid"
      label={t('invalidLabel')}
      hint={t('invalidHint')}
      error={t('invalidError')}
      required
      className="w-72"
    >
      {(control) => (
        <Combobox
          {...control}
          value={value}
          onValueChange={setValue}
          options={people}
          placeholder={t('placeholder')}
        />
      )}
    </FormField>
  );
}

function DialogDemo({ people }: { people: readonly ComboboxOption[] }) {
  const t = useTranslations('devUi.combobox');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState('');
  const [teamLead, setTeamLead] = useState('');
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('dialogOpen')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tCommon('close')}>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
          <FormField
            id="combobox-demo-dialog-position"
            label={t('dialogPosition')}
          >
            {(control) => (
              <Combobox
                {...control}
                value={position}
                onValueChange={setPosition}
                placeholder={t('placeholder')}
                options={[
                  { value: 'short', label: t('shortOption') },
                  { value: 'long', label: t('longOption') },
                ]}
              />
            )}
          </FormField>
          <FormField id="combobox-demo-dialog-lead" label={t('dialogTeamLead')}>
            {(control) => (
              <Combobox
                {...control}
                value={teamLead}
                onValueChange={setTeamLead}
                placeholder={t('placeholder')}
                clearable
                options={people}
              />
            )}
          </FormField>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ComboboxDemos() {
  const t = useTranslations('devUi.combobox');
  const tPeople = useTranslations('devUi.combobox.people');
  const person = (
    key: 'vasylGambling' | 'vasylCrypto' | 'taras' | 'olena' | 'yaroslav',
    extra: Partial<ComboboxOption> = {},
  ): ComboboxOption => ({
    value: key,
    label: tPeople(`${key}.name`),
    description: tPeople(`${key}.line`),
    avatar: true,
    ...extra,
  });
  const people: ComboboxOption[] = [
    person('vasylGambling'),
    person('taras'),
    person('vasylCrypto'),
    person('olena'),
    person('yaroslav', { inactive: true, disabled: true }),
  ];
  const positions = useMemo(
    () =>
      Array.from({ length: 200 }, (_, index) => ({
        value: `position-${index + 1}`,
        label: t('positionN', { n: index + 1 }),
      })),
    [t],
  );
  const longOptions: ComboboxOption[] = [
    { value: 'short', label: t('shortOption') },
    { value: 'long', label: t('longOption') },
  ];
  const failedOnce = useRef(false);
  const failFirst = async () => {
    if (!failedOnce.current) {
      failedOnce.current = true;
      throw new Error('offline');
    }
    return people;
  };
  const openFromKeyboard = () => {
    const field = document.getElementById(OPEN_FIELD_ID);
    field?.focus();
    field?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  return (
    <>
      <GalleryGroup title={t('states')}>
        <Demo id="combobox-demo-placeholder" label={t('placeholderLabel')}>
          {(field) => (
            <Combobox
              {...field}
              options={people}
              placeholder={t('placeholder')}
              clearable
            />
          )}
        </Demo>
        <Demo
          id="combobox-demo-selected"
          label={t('selectedLabel')}
          initial="taras"
        >
          {(field) => <Combobox {...field} options={people} clearable />}
        </Demo>
        <InvalidDemo people={people} />
        <Demo
          id="combobox-demo-disabled"
          label={t('disabledLabel')}
          initial="taras"
        >
          {(field) => <Combobox {...field} options={people} disabled />}
        </Demo>
        <Demo id="combobox-demo-stale" label={t('staleLabel')} initial="gone">
          {(field) => (
            <Combobox
              {...field}
              options={people}
              placeholder={t('placeholder')}
            />
          )}
        </Demo>
      </GalleryGroup>
      <GalleryGroup title={t('peopleGroup')} hint={t('peopleHint')}>
        <Demo id="combobox-demo-duplicates" label={t('duplicatesLabel')}>
          {(field) => (
            <Combobox
              {...field}
              options={people}
              placeholder={t('placeholder')}
            />
          )}
        </Demo>
        <Demo
          id="combobox-demo-inactive"
          label={t('inactiveLabel')}
          initial="yaroslav"
        >
          {(field) => <Combobox {...field} options={people} clearable />}
        </Demo>
      </GalleryGroup>
      <GalleryGroup title={t('openGroup')} hint={t('openHint')}>
        <Demo id={OPEN_FIELD_ID} label={t('openLabel')} initial="olena">
          {(field) => <Combobox {...field} options={people} />}
        </Demo>
        <Button variant="outline" onClick={openFromKeyboard}>
          {t('openButton')}
        </Button>
      </GalleryGroup>
      <GalleryGroup title={t('searchGroup')} hint={t('searchHint')}>
        <Demo id="combobox-demo-search" label={t('searchLabel')}>
          {(field) => (
            <Combobox
              {...field}
              placeholder={t('placeholder')}
              clearable
              onSearch={async (query, signal) => {
                await wait(SEARCH_DELAY_MS, signal);
                return filterOptions(people, query);
              }}
            />
          )}
        </Demo>
        <Demo id="combobox-demo-loading" label={t('loadingLabel')}>
          {(field) => (
            <Combobox
              {...field}
              placeholder={t('placeholder')}
              onSearch={(_query, signal) =>
                wait(null, signal).then(() => people)
              }
            />
          )}
        </Demo>
        <Demo id="combobox-demo-empty" label={t('emptyLabel')}>
          {(field) => (
            <Combobox
              {...field}
              options={[]}
              placeholder={t('placeholder')}
              emptyText={t('emptyText')}
            />
          )}
        </Demo>
        <Demo id="combobox-demo-error" label={t('errorLabel')}>
          {(field) => (
            <Combobox
              {...field}
              placeholder={t('placeholder')}
              onSearch={failFirst}
            />
          )}
        </Demo>
      </GalleryGroup>
      <GalleryGroup title={t('manyGroup')} hint={t('manyHint')}>
        <Demo id="combobox-demo-many" label={t('manyLabel')}>
          {(field) => (
            <Combobox
              {...field}
              options={positions}
              placeholder={t('placeholder')}
            />
          )}
        </Demo>
        <Demo
          id="combobox-demo-long"
          label={t('longLabel')}
          initial="long"
          className="w-80 max-w-full"
        >
          {(field) => <Combobox {...field} options={longOptions} />}
        </Demo>
      </GalleryGroup>
      <GalleryGroup title={t('dialogGroup')} hint={t('dialogHint')}>
        <DialogDemo people={people} />
      </GalleryGroup>
    </>
  );
}
