'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  RowActionsMenu,
  type RowAction,
} from '@/components/ui/row-actions-menu';
import { vacancyDetailQuery } from '@/lib/queries/vacancy-detail';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import {
  vacancyEditHref,
  type DraftActions,
} from '@/lib/vacancy-draft-actions';
import { closeActions, openCardAction, useDraftClose } from './use-draft-close';
import { preloadDraftPublish, useDraftPublish } from './use-draft-publish';

/** The menu of an own draft row; its own chunk, so the list's initial JavaScript carries none of the publish, cancel or delete code (PERF-04). */
export default function DraftMenu({
  vacancy,
  plan,
}: {
  vacancy: VacancySummary;
  plan: DraftActions;
}) {
  const t = useTranslations('vacancies');
  const router = useRouter();
  const queryClient = useQueryClient();
  const publish = useDraftPublish();
  const { openDialog, dialog } = useDraftClose({
    ...vacancy,
    status: plan.stage,
  });
  const draft = plan.stage === 'DRAFT';
  // Publishing needs the draft's version: reading it on hover or focus makes the press itself instant.
  const prefetch = () => {
    if (!draft || plan.publishBlocked) return;
    void queryClient.prefetchQuery(vacancyDetailQuery(vacancy.id));
    preloadDraftPublish();
  };
  const actions: RowAction[] = [
    ...(draft
      ? [
          {
            id: 'edit',
            label: t('draft.actions.edit'),
            onSelect: () => router.push(vacancyEditHref(vacancy.id)),
          },
          {
            id: 'publish',
            label: t('draft.actions.publish'),
            onSelect: () => publish(vacancy),
            disabledReason: plan.publishBlocked
              ? t('draftErrors.positionRequired')
              : undefined,
          },
        ]
      : [openCardAction(t, () => router.push(`/vacancies/${vacancy.id}`))]),
    ...closeActions(t, openDialog, plan.stage),
  ];
  return (
    <>
      <span onPointerEnter={prefetch} onFocus={prefetch} className="shrink-0">
        <RowActionsMenu
          label={t('draft.actions.menuLabel', { title: vacancy.title })}
          actions={actions}
        />
      </span>
      {dialog}
    </>
  );
}
