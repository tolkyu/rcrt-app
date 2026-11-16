'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  FieldErrors,
  UseFormGetValues,
  UseFormSetValue,
} from 'react-hook-form';
import {
  filterOptions,
  type ComboboxOption,
} from '@/components/ui/combobox-shared';
import type { VacancyFormValues } from '@/lib/vacancy-form';
import { loadSubmit, type SubmitModule } from '@/lib/vacancy-form-load';
import type { PositionsSeed } from '@/lib/vacancy-form-submit';

/** Vertical → position → title dependencies of the create form (ux §2.1);  */
export function usePositionPicker({
  form: { getValues, setValue, errors },
  verticalId,
  initialVerticalId,
  initialPositions,
  pending,
  onVerticalChange,
}: {
  form: {
    getValues: UseFormGetValues<VacancyFormValues>;
    setValue: UseFormSetValue<VacancyFormValues>;
    errors: FieldErrors<VacancyFormValues>;
  };
  verticalId: string;
  initialVerticalId: string;
  initialPositions: PositionsSeed | undefined;
  pending: boolean;
  onVerticalChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [autoTitle, setAutoTitle] = useState('');
  const [verticalNote, setVerticalNote] = useState(false);
  const [catalogEmpty, setCatalogEmpty] = useState(false);

  const choosePosition = (id: string) => {
    if (pending) return;
    const apply = (loaded: SubmitModule) => {
      setVerticalNote(false);
      setAutoTitle(
        loaded.applyPosition(
          { getValues, setValue },
          errors,
          autoTitle,
          id,
          id
            ? loaded.cachedPositionName(queryClient, verticalId, id)
            : undefined,
        ),
      );
    };
    // The module is cached after the first load, and a first load that failed is tried again here.
    void loadSubmit().then(apply, () => undefined);
  };

  const chooseVertical = (id: string) => {
    if (pending || id === getValues('verticalId')) return;
    const hadPosition = getValues('positionId') !== '';
    setValue('verticalId', id, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: Boolean(errors.verticalId),
    });
    setCatalogEmpty(false);
    onVerticalChange();
    if (hadPosition) choosePosition('');
    setVerticalNote(hadPosition);
  };

  const searchPositions = async (
    query: string,
  ): Promise<readonly ComboboxOption[]> => {
    const list = await (
      await loadSubmit()
    ).fetchActivePositions(
      queryClient,
      verticalId,
      initialVerticalId,
      initialPositions,
    );
    const options = list.items.map((position) => ({
      value: position.id,
      label: position.name,
    }));
    if (!query.trim()) setCatalogEmpty(options.length === 0);
    return filterOptions(options, query);
  };

  return {
    choosePosition,
    chooseVertical,
    searchPositions,
    catalogEmpty,
    verticalNote,
    autoTitle,
  };
}
