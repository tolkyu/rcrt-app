'use client';

import { Pencil, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';
import {
  RowActionsMenu,
  type RowAction,
} from '@/components/ui/row-actions-menu';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import {
  vacancyEditHref,
  type DraftActions,
} from '@/lib/vacancy-draft-actions';
import { closeActions, useDraftClose } from './use-draft-close';
import {
  preloadDraftPublish,
  useDraftPublish,
  type CardFocus,
} from './use-draft-publish';

/** Header actions of an own draft; its own chunk (PERF-04). A draft: «Опублікувати», «Редагувати» and `⋯` with cancel and delete (the preview's `⋯` also opens the card); on a phone the primary action takes a full row and «Редагувати» with `⋯` the next (spec §6.2). A cancelled draft can only be deleted. The edit link keeps the default prefetch: for this dynamic page that fetches only the loading boundary, so a click shows the skeleton at once and never reads a draft version that a full prefetch could have cached. */
export default function DraftActionButtons({
  vacancy,
  plan,
  preview,
  card,
  publishRef,
}: {
  vacancy: VacancyDetail;
  plan: DraftActions;
  preview: boolean;
  card: CardFocus;
  publishRef: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations('vacancies');
  const router = useRouter();
  const publish = useDraftPublish();
  const { openDialog, dialog } = useDraftClose(
    { ...vacancy, status: plan.stage },
    card,
  );
  if (plan.stage === 'CANCELLED')
    return (
      <>
        <Button
          size="sm"
          variant="destructive-soft"
          className="h-11 flex-1 md:flex-none"
          onClick={() => openDialog('delete')}
        >
          <Trash2 aria-hidden="true" />
          {t('draft.actions.delete')}
        </Button>
        {dialog}
      </>
    );
  const menu: RowAction[] = [
    ...(preview
      ? [
          {
            id: 'open',
            label: t('openCard'),
            onSelect: () => router.push(`/vacancies/${vacancy.id}`),
          },
        ]
      : []),
    ...closeActions(t, openDialog, plan.stage),
  ];
  return (
    <>
      <DisabledReason
        reason={t('draftErrors.positionRequired')}
        disabled={Boolean(plan.publishBlocked)}
        className="w-full basis-full md:w-auto md:basis-auto"
      >
        <Button
          ref={publishRef}
          size="sm"
          className="h-11 max-md:w-full"
          onPointerEnter={preloadDraftPublish}
          onFocus={preloadDraftPublish}
          onClick={() => publish(vacancy, card)}
        >
          <Send aria-hidden="true" />
          {t('draft.actions.publish')}
        </Button>
      </DisabledReason>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-11 flex-1 md:flex-none"
      >
        <Link href={vacancyEditHref(vacancy.id)}>
          <Pencil aria-hidden="true" />
          {t('draft.actions.edit')}
        </Link>
      </Button>
      <RowActionsMenu
        label={t('draft.actions.menuLabel', { title: vacancy.title })}
        actions={menu}
      />
      {dialog}
    </>
  );
}
