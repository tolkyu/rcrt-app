'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  FilterChips,
  type FilterChipOption,
} from '@/components/ui/filter-chips';
import { GalleryGroup } from './gallery-section';

function Example({
  label,
  initial = '',
  options,
  disabled,
}: {
  label: string;
  initial?: string;
  options: FilterChipOption[];
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-full min-w-0">
      <FilterChips
        label={label}
        options={options}
        value={value}
        onValueChange={setValue}
        disabled={disabled}
      />
    </div>
  );
}

export function FilterChipsDemos() {
  const t = useTranslations('devUi.filterChips');
  const options = useMemo<FilterChipOption[]>(
    () => [
      { value: '', label: t('all'), count: 1284 },
      { value: 'OPEN', label: t('open'), count: 24 },
      { value: 'DRAFT', label: t('drafts'), count: 1 },
      { value: 'ON_HOLD', label: t('onHold'), count: 0 },
      { value: 'FILLED', label: t('filled') },
      { value: 'CANCELLED', label: t('cancelled') },
    ],
    [t],
  );
  const draft = useMemo(
    () => options.filter((option) => option.value === 'DRAFT'),
    [options],
  );
  return (
    <>
      <GalleryGroup title={t('states')} hint={t('statesHint')}>
        <Example label={t('statuses')} options={options} />
        <Example label={t('offscreen')} options={options} initial="CANCELLED" />
        <Example
          label={t('withoutDrafts')}
          options={options.filter((option) => option.value !== 'DRAFT')}
        />
      </GalleryGroup>
      <GalleryGroup title={t('edgeCases')}>
        <Example
          label={t('withoutCounts')}
          options={options.map(({ value, label }) => ({ value, label }))}
        />
        <Example
          label={t('draftCount')}
          initial="DRAFT"
          options={options.map((option) =>
            option.value === 'DRAFT' ? { ...option, count: 4 } : option,
          )}
        />
        <Example
          label={t('disabledOption')}
          options={options.map((option) => ({
            ...option,
            disabled: option.value === 'OPEN',
          }))}
        />
        <Example label={t('disabled')} options={options} disabled />
        <Example label={t('one')} options={draft} initial="DRAFT" />
        <Example label={t('empty')} options={[]} />
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      </GalleryGroup>
    </>
  );
}
