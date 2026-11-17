import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { VacancyRequestForm } from '@/components/vacancies/vacancy-request-form';
import { requestsAnywhere } from '@/server/authz/vacancy-request';
import { requireSession } from '../../_lib/session';
import { getRequestVerticals } from '../../_lib/request-form-verticals';
import { loadPositionSeed } from '../_lib/position-seed';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancyRequest');
  return { title: t('metaTitle') };
}

/** «Запросити вакансію» (STORY-VAC-03-3): one position list per eligible vertical is prefetched and handed over as props, like the full create form (PERF-04). */
export default async function RequestVacancyPage() {
  const ctx = await requireSession();
  // Defence in depth: the layout already refuses non-Team Leads.
  if (!requestsAnywhere(ctx.auth)) notFound();
  const verticals = await getRequestVerticals();
  const seeds = await Promise.all(
    verticals.map(async (vertical) => {
      const seed = await loadPositionSeed(ctx, vertical.id);
      return seed
        ? {
            verticalId: vertical.id,
            items: seed.list.items,
            loadedAt: seed.loadedAt,
          }
        : undefined;
    }),
  );
  return (
    <div className="max-w-[45rem]">
      <VacancyRequestForm
        verticals={verticals.map(({ id, name }) => ({ id, name }))}
        initialPositions={seeds.filter((seed) => seed !== undefined)}
      />
    </div>
  );
}
