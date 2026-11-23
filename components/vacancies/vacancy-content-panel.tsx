'use client';

import { Pencil } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RichTextView } from '@/components/rich-text/rich-text-view';
import { SectionError } from '@/components/states/section-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import {
  CONTENT_FIELDS,
  isEditableStatus,
  type ContentField,
} from '@/lib/vacancy-content-form';
import type { VacancyContentAccessState } from './use-vacancy-content-access';

const FIELD_TEXT = {
  descriptionDoc: { label: 'description', empty: 'emptyDescription' },
  requirementsDoc: { label: 'requirements', empty: 'emptyRequirements' },
} as const satisfies Record<ContentField, { label: string; empty: string }>;

/** The link follows the same fresh read as the editor page (ADR-020): no role, creator or detail-cache shortcut. */
export function VacancyContentEditLink({
  id,
  state,
}: {
  id: string;
  state: VacancyContentAccessState;
}) {
  const t = useTranslations('vacancies.contentCard');
  if (
    state.kind !== 'readable' ||
    !state.content.canEditContent ||
    !isEditableStatus(state.content.status)
  )
    return null;
  return (
    <Button asChild size="sm" variant="outline" className="h-11">
      <Link href={`/vacancies/${id}/content/edit`}>
        <Pencil aria-hidden="true" />
        {t('editAction')}
      </Link>
    </Button>
  );
}

function ContentSkeleton() {
  const t = useTranslations('states');
  return (
    <div role="status" className="skeleton-delayed flex flex-col gap-4">
      <span className="sr-only">{t('loading')}</span>
      {CONTENT_FIELDS.map((field) => (
        <div key={field} aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Read-only description and requirements; a draft shows none because its documents are edited in the draft form. */
export function VacancyContentPanel({
  id,
  state,
  onRetry,
}: {
  id: string;
  state: VacancyContentAccessState;
  onRetry: () => void;
}) {
  const t = useTranslations('vacancies');
  const fetching = useIsFetching({ queryKey: queryKeys.vacancyContent(id) });
  if (state.kind === 'unavailable') return null;
  if (state.kind === 'readable' && state.content.status === 'DRAFT')
    return null;
  return (
    <section aria-labelledby="vacancy-content-detail">
      <h2 id="vacancy-content-detail" className="mb-2 text-sm font-semibold">
        {t('contentCard.title')}
      </h2>
      {state.kind === 'readable' ? (
        <div className="flex min-w-0 flex-col gap-4">
          {CONTENT_FIELDS.map((field) => {
            const document = state.content[field];
            return (
              <div key={field} className="min-w-0">
                <h3 className="text-muted-foreground mb-1 text-sm">
                  {t(`contentEdit.${FIELD_TEXT[field].label}`)}
                </h3>
                {document ? (
                  <div className="text-sm [overflow-wrap:anywhere]">
                    <RichTextView document={document} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t(`contentEdit.${FIELD_TEXT[field].empty}`)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : state.error ? (
        <SectionError onRetry={onRetry} retrying={fetching > 0} />
      ) : (
        <ContentSkeleton />
      )}
    </section>
  );
}
