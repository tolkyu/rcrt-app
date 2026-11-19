import { useTranslations } from 'next-intl';
import { FormRailFrame } from '@/components/ui/form-rail';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import { useEditSubtitle } from '@/components/vacancies/edit-subtitle';
import {
  EDIT_BUTTON_WIDTHS,
  vacancyFormSkeleton,
} from '@/components/vacancies/vacancy-form-skeleton';
import type { VacancyDetail } from '@/lib/schemas/vacancy';

/** Loading twin of `VacancyEditForm`: the real heading when the draft is known, so nothing moves when the form replaces it. */
export function EditFormSkeleton({
  vacancy,
  withTeamLead,
  withProbation,
}: {
  vacancy: VacancyDetail | null;
  withTeamLead: boolean;
  withProbation: boolean;
}) {
  const t = useTranslations('vacancyForm');
  const subtitle = useEditSubtitle(vacancy);
  return (
    <FormRailFrame>
      <FormSkeleton
        title={t('edit.title')}
        subtitle={subtitle}
        back={{ href: '/vacancies', label: t('back') }}
        fields={vacancyFormSkeleton({
          withTeamLead,
          withProbation,
          lockedVertical: true,
        })}
        buttonWidths={EDIT_BUTTON_WIDTHS}
        rail
      />
    </FormRailFrame>
  );
}
