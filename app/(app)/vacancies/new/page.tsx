import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { VacancyCreateForm } from '@/components/vacancies/vacancy-create-form';
import { VACANCY_FORM_WIDTH } from '@/components/vacancies/vacancy-form-skeleton';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { ALL_VERTICALS, resolveVerticalFilter } from '@/lib/vertical-filter';
import { hasAnyGrant } from '@/server/authz/can';
import {
  authorsAnywhere,
  vacancyAuthorVerticals,
} from '@/server/authz/vacancy-author';
import type { VerticalId } from '@/server/authz/types';
import { describeError, logger } from '@/server/observability/logger';
import { listPositionCatalog } from '@/server/services/position';
import { requireSession } from '../../_lib/session';
import { getVisibleVerticals } from '../../_lib/verticals';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancyForm');
  return { title: t('metaTitle') };
}

/** «Нова вакансія» (VAC-01, D89): only verticals where the caller authors (not merely reads) are offered; the layout and this page both refuse everyone else. */
export default async function NewVacancyPage() {
  const ctx = await requireSession();
  // Defence in depth: the layout already refuses non-authors; the page must not rely on it alone.
  if (!authorsAnywhere(ctx.auth)) notFound();
  const [cookieStore, visible] = await Promise.all([
    cookies(),
    getVisibleVerticals(),
  ]);
  const authoring = vacancyAuthorVerticals(ctx.auth).any;
  const verticals = visible.items.filter(
    (vertical) =>
      authoring === 'ALL' || authoring.has(vertical.id as VerticalId),
  );
  const [only] = verticals;
  // One option is preset (and shown disabled); with several, the header vertical (D83) presets, «Усі» leaves the choice open.
  const preset =
    verticals.length === 1 && only
      ? only.id
      : resolveVerticalFilter(
          cookieStore.get(PREFERENCE_COOKIES.vertical)?.value,
          verticals,
        );
  const verticalId = preset === ALL_VERTICALS ? '' : preset;
  // The picker's list is prefetched on the server and handed over as a prop: `HydrationBoundary` would add its code to this route's initial JavaScript a second time (PERF-04).
  const initialPositions = verticalId
    ? await listPositionCatalog(ctx, { status: 'active', verticalId }).then(
        (list) => ({ list, loadedAt: ctx.clock.now().getTime() }),
        (error: unknown) => {
          // The picker loads the list itself and shows its own error row; the log carries no names or ids.
          logger.error(
            { err: describeError(error) },
            'vacancy form position prefetch failed',
          );
          return undefined;
        },
      )
    : undefined;
  return (
    <div className={VACANCY_FORM_WIDTH}>
      <VacancyCreateForm
        verticals={verticals}
        initialVerticalId={verticalId}
        initialPositions={initialPositions}
        canManagePositions={hasAnyGrant(ctx.auth, 'position.manage')}
      />
    </div>
  );
}
