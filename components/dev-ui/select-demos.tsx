'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, type SelectOption } from '@/components/ui/select';
import { GalleryGroup } from './gallery-section';

interface Labels {
  states: string;
  placeholderLabel: string;
  placeholder: string;
  selectedLabel: string;
  allLabel: string;
  all: string;
  gambling: string;
  crypto: string;
  gamblingHint: string;
  cryptoHint: string;
  invalidLabel: string;
  disabledLabel: string;
  emptyLabel: string;
  longGroup: string;
  longHint: string;
  longLabel: string;
  longOption: string;
  shortOption: string;
  narrowLabel: string;
  openGroup: string;
  openHint: string;
  openButton: string;
  openLabel: string;
}

const OPEN_FIELD_ID = 'select-demo-open';

function Field({
  label,
  initial,
  id,
  className = 'w-64',
  ...props
}: {
  label: string;
  id: string;
  initial: string;
  options: readonly SelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select id={id} value={value} onValueChange={setValue} {...props} />
    </div>
  );
}

export function SelectDemos({ labels }: { labels: Labels }) {
  const verticals: SelectOption[] = [
    {
      value: 'gambling',
      label: labels.gambling,
      description: labels.gamblingHint,
    },
    { value: 'crypto', label: labels.crypto, description: labels.cryptoHint },
  ];
  const withAll = [{ value: '', label: labels.all }, ...verticals];
  const long: SelectOption[] = [
    { value: 'short', label: labels.shortOption },
    { value: 'long', label: labels.longOption },
  ];
  const openFromKeyboard = () => {
    const trigger = document.getElementById(OPEN_FIELD_ID);
    trigger?.focus();
    trigger?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  return (
    <>
      <GalleryGroup title={labels.states}>
        <Field
          id="select-demo-placeholder"
          label={labels.placeholderLabel}
          initial=""
          options={verticals}
          placeholder={labels.placeholder}
        />
        <Field
          id="select-demo-selected"
          label={labels.selectedLabel}
          initial="gambling"
          options={verticals}
        />
        <Field
          id="select-demo-all"
          label={labels.allLabel}
          initial=""
          options={withAll}
        />
        <Field
          id="select-demo-invalid"
          label={labels.invalidLabel}
          initial=""
          options={verticals}
          placeholder={labels.placeholder}
          aria-invalid
        />
        <Field
          id="select-demo-disabled"
          label={labels.disabledLabel}
          initial="crypto"
          options={verticals}
          disabled
        />
        <Field
          id="select-demo-empty"
          label={labels.emptyLabel}
          initial=""
          options={[]}
        />
      </GalleryGroup>
      <GalleryGroup title={labels.longGroup} hint={labels.longHint}>
        <Field
          id="select-demo-long"
          label={labels.longLabel}
          initial="long"
          options={long}
        />
        <Field
          id="select-demo-narrow"
          label={labels.narrowLabel}
          initial="long"
          options={long}
          className="w-80 max-w-full"
        />
      </GalleryGroup>
      <GalleryGroup title={labels.openGroup} hint={labels.openHint}>
        <Field
          id={OPEN_FIELD_ID}
          label={labels.openLabel}
          initial=""
          options={withAll}
        />
        <Button variant="outline" onClick={openFromKeyboard}>
          {labels.openButton}
        </Button>
      </GalleryGroup>
    </>
  );
}
