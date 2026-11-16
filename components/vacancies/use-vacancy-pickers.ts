'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
import {
  verticalResetNote,
  type VacancyFormValues,
  type VerticalResetNote,
} from '@/lib/vacancy-form';
import { loadSubmit, type SubmitModule } from '@/lib/vacancy-form-load';
import type { PositionsSeed } from '@/lib/vacancy-form-submit';

/** Vertical → position / Team Lead → title dependencies of the create form (ux §2.1). */
export function useVacancyPickers({
  form: { getValues, setValue, errors },
  verticalId,
  verticalName,
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
  verticalName: string;
  initialVerticalId: string;
  initialPositions: PositionsSeed | undefined;
  pending: boolean;
  onVerticalChange: () => void;
}) {
  const t = useTranslations('vacancyForm');
  const queryClient = useQueryClient();
  const [autoTitle, setAutoTitle] = useState('');
  const [verticalNote, setVerticalNote] = useState<VerticalResetNote | null>(
    null,
  );
  const [catalogEmpty, setCatalogEmpty] = useState(false);
  const [teamLeadsEmpty, setTeamLeadsEmpty] = useState(false);

  const choosePosition = (id: string, keepNote = false) => {
    if (pending) return;
    const apply = (loaded: SubmitModule) => {
      if (!keepNote) setVerticalNote(null);
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

  const chooseTeamLead = (id: string) => {
    if (pending) return;
    setVerticalNote(null);
    setValue('teamLeadId', id, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: Boolean(errors.teamLeadId),
    });
  };

  const chooseVertical = (id: string) => {
    if (pending || id === getValues('verticalId')) return;
    const hadPosition = getValues('positionId') !== '';
    const hadTeamLead = getValues('teamLeadId') !== '';
    setValue('verticalId', id, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: Boolean(errors.verticalId),
    });
    if (hadTeamLead)
      setValue('teamLeadId', '', {
        shouldDirty: true,
        shouldValidate: Boolean(errors.teamLeadId),
      });
    setCatalogEmpty(false);
    setTeamLeadsEmpty(false);
    onVerticalChange();
    if (hadPosition) choosePosition('', true);
    setVerticalNote(verticalResetNote(hadPosition, hadTeamLead));
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
    setCatalogEmpty(options.length === 0);
    return filterOptions(options, query);
  };

  const searchTeamLeads = async (
    query: string,
  ): Promise<readonly ComboboxOption[]> => {
    const list = await (
      await loadSubmit()
    ).fetchAssignableTeamLeads(queryClient, verticalId);
    const options = list.items.map((lead) => ({
      value: lead.id,
      label: lead.fullName,
      avatar: true,
      description:
        lead.priority === null
          ? t('teamLead.option', { vertical: verticalName })
          : t('teamLead.optionPriority', {
              vertical: verticalName,
              priority: lead.priority,
            }),
    }));
    // The flag describes the vertical, not the filter: a later list that has people clears it.
    setTeamLeadsEmpty(options.length === 0);
    return filterOptions(options, query);
  };

  return {
    choosePosition,
    chooseTeamLead,
    chooseVertical,
    searchPositions,
    searchTeamLeads,
    catalogEmpty,
    teamLeadsEmpty,
    verticalNote,
    autoTitle,
  };
}
