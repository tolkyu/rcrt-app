import { getTranslations } from 'next-intl/server';
import { FormRailFrame } from '@/components/ui/form-rail';
import { FormSkeleton } from '@/components/ui/form-skeleton';
import { vacancyFormSkeleton } from '@/components/vacancies/vacancy-form-skeleton';
import { probationFieldShown, teamLeadFieldShown } from '@/lib/vacancy-form';
import { getCreateFormVerticals } from '../../_lib/create-form-verticals';

export default async function NewVacancyLoading() {
  // Session and verticals are already resolved for this request (layout, shell), so these are cache hits.
  const [t, { verticals, verticalId }] = await Promise.all([
    getTranslations('vacancyForm'),
    getCreateFormVerticals(),
  ]);
  return (
    <FormRailFrame>
      <FormSkeleton
        title={t('title')}
        subtitle={t('subtitle')}
        back={{ href: '/vacancies', label: t('back') }}
        fields={vacancyFormSkeleton({
          withTeamLead: teamLeadFieldShown(verticals, verticalId),
          withProbation: probationFieldShown(verticals, verticalId),
        })}
        rail
      />
    </FormRailFrame>
  );
}
