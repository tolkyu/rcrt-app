'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from '@/lib/toast';
import { retried } from '@/lib/vacancy-form-load';
import type { PublishedDraft } from '@/lib/vacancy-draft-publish';
import { useDraftLeave } from './draft-leave';

const loadDraftPublish = () =>
  retried(() => import('@/lib/vacancy-draft-publish'));

/** Where focus goes when no list takes the publish over (the card). */
export interface CardFocus {
  readonly removed: () => void;
  readonly restored: () => void;
}

/** Hover and focus fetch the chunk, so the press itself finds it loaded; a failure here is retried by the press. */
export const preloadDraftPublish = () => {
  loadDraftPublish().catch(() => undefined);
};

/** One press = one publish: the chunk loads first (a failure stops the call before the server acts), the row leaves optimistically, every answer ends in a toast. */
export function useDraftPublish() {
  const t = useTranslations('vacancies.draft.actions');
  const router = useRouter();
  const queryClient = useQueryClient();
  const leave = useDraftLeave();
  const open = (href: string) => router.push(href);

  return function publish(draft: PublishedDraft, onCard?: CardFocus) {
    // A rejected run (anything the outcome does not describe) ends in a toast whose button starts over.
    function start(): void {
      run().catch(() =>
        toast.error(t('toast.failed'), {
          description: t('toast.failedDescription'),
          action: { label: t('toast.retry'), onAction: start },
        }),
      );
    }
    async function run(): Promise<void> {
      let lib: Awaited<ReturnType<typeof loadDraftPublish>>;
      try {
        lib = await loadDraftPublish();
      } catch {
        toast.error(t('toast.noConnection'), {
          description: t('toast.noConnectionDescription'),
          action: { label: t('toast.retry'), onAction: start },
        });
        return;
      }
      const outcome = await lib.publishFromList(queryClient, draft.id, {
        // The list moves selection and focus when it holds the row; otherwise (the card, or a row outside the page) the caller's rule applies.
        removed: () => {
          if (!leave?.removed(draft.id)) onCard?.removed();
        },
        restored: () => {
          if (!leave?.restored(draft.id)) onCard?.restored();
        },
        settled: () => leave?.settled(draft.id),
      });
      if (outcome.status !== 'busy')
        lib.announcePublish(t, open, outcome, draft, start);
    }
    start();
  };
}
