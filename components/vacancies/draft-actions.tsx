'use client';

import { Pencil, Send } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import {
  vacancyEditHref,
  type DraftActions,
} from '@/lib/vacancy-draft-actions';
import {
  preloadDraftPublish,
  useDraftPublish,
  type CardFocus,
} from './use-draft-publish';

/** «Опублікувати» and «Редагувати» of an own draft; its own chunk (PERF-04). On a phone the primary action takes a full row and «Редагувати» the next (spec §6.2). The edit link keeps the default prefetch: for this dynamic page that fetches only the loading boundary, so a click shows the skeleton at once and never reads a draft version that a full prefetch could have cached. */
export default function DraftActionButtons({
  vacancy,
  plan,
  card,
  publishRef,
}: {
  vacancy: VacancyDetail;
  plan: DraftActions;
  card: CardFocus;
  publishRef: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations('vacancies');
  const publish = useDraftPublish();
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
    </>
  );
}
