import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FormRailFrame } from '@/components/ui/form-rail';
import { VacancyCreateForm } from '@/components/vacancies/vacancy-create-form';
import { hasAnyGrant } from '@/server/authz/can';
import { authorsAnywhere } from '@/server/authz/vacancy-author';
import { describeError, logger } from '@/server/observability/logger';
import { listPositionCatalog } from '@/server/services/position';
import { countOwnDrafts } from '@/server/services/vacancy';
import { getCreateFormVerticals } from '../../_lib/create-form-verticals';
import { requireSession } from '../../_lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancyForm');
  return { title: t('metaTitle') };
}

/** «Нова вакансія» (VAC-01, D89): only verticals where the caller authors (not merely reads) are offered; the layout and this page both refuse everyone else. */
export default async function NewVacancyPage() {
  const ctx = await requireSession();
  // Defence in depth: the layout already refuses non-authors; the page must not rely on it alone.
  if (!authorsAnywhere(ctx.auth)) notFound();
  const { verticals, verticalId } = await getCreateFormVerticals();
  // Both lists are prefetched on the server and handed over as props (the positions seed the cache with their own age): `HydrationBoundary` would add its code to this route's initial JavaScript a second time (PERF-04).
  const [initialPositions, initialDraftCount] = await Promise.all([
    verticalId
      ? listPositionCatalog(ctx, { status: 'active', verticalId }).then(
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
      : undefined,
    countOwnDrafts(ctx).then(
      ({ count }) => count,
      (error: unknown) => {
        // The query asks again on mount; the server still decides at save time.
        logger.error(
          { err: describeError(error) },
          'vacancy draft count prefetch failed',
        );
        return undefined;
      },
    ),
  ]);
  return (
    <FormRailFrame>
      <VacancyCreateForm
        verticals={verticals}
        initialVerticalId={verticalId}
        initialPositions={initialPositions}
        initialDraftCount={initialDraftCount}
        canManagePositions={hasAnyGrant(ctx.auth, 'position.manage')}
      />
    </FormRailFrame>
  );
}
