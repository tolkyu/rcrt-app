import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FormRailFrame } from '@/components/ui/form-rail';
import { EditNotDraft } from '@/components/vacancies/edit-not-draft';
import { VacancyEditForm } from '@/components/vacancies/vacancy-edit-form';
import { hasAnyGrant } from '@/server/authz/can';
import type { VerticalId } from '@/server/authz/types';
import {
  vacancyAuthorKind,
  vacancyFormGrants,
} from '@/server/authz/vacancy-author';
import { getVacancyContent } from '@/server/services/vacancy-content';
import { requireSession } from '../../../_lib/session';
import { loadPositionSeed } from '../../_lib/position-seed';
import { loadVacancy } from '../../_lib/vacancy';

type Props = { params: Promise<{ vacancyId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancyForm.edit');
  return { title: t('metaTitle') };
}

/** «Редагування чернетки» (VAC-01, D92): only the author's own live draft opens as a form; any other vacancy of a vertical the caller authors in gets the not-a-draft state, everything else is the layout's 404. */
export default async function EditVacancyPage({ params }: Props) {
  const [ctx, vacancy] = await Promise.all([
    requireSession(),
    params.then(({ vacancyId }) => loadVacancy(vacancyId)),
  ]);
  const verticalId = vacancy?.vertical.id as VerticalId | undefined;
  // Defence in depth: the layout already refused these; the page must not rely on it alone.
  if (!vacancy || !verticalId || !vacancyAuthorKind(ctx.auth, verticalId))
    notFound();
  if (vacancy.status !== 'DRAFT') return <EditNotDraft vacancy={vacancy} />;
  const [initialPositions, content] = await Promise.all([
    loadPositionSeed(ctx, verticalId),
    getVacancyContent(ctx, vacancy.id),
  ]);
  return (
    <FormRailFrame>
      <VacancyEditForm
        vacancy={vacancy}
        initialContent={{
          descriptionDoc: content.descriptionDoc,
          requirementsDoc: content.requirementsDoc,
        }}
        vertical={{
          id: verticalId,
          name: vacancy.vertical.name,
          ...vacancyFormGrants(ctx.auth, verticalId),
        }}
        initialPositions={initialPositions}
        canManagePositions={hasAnyGrant(ctx.auth, 'position.manage')}
      />
    </FormRailFrame>
  );
}
