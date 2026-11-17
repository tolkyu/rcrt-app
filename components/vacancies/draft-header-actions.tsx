'use client';

import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { lazy, Suspense, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import {
  vacancyEditHref,
  type DraftActions,
} from '@/lib/vacancy-draft-actions';
import { MenuPlaceholder } from './draft-row-menu';
import type { CardFocus } from './use-draft-publish';

const DraftActionButtons = lazy(() => import('./draft-actions'));

/** The final blocks with the real layout classes, so the header keeps its height while the code arrives. */
const ActionsPlaceholder = ({ stage }: { stage: DraftActions['stage'] }) =>
  stage === 'DRAFT' ? (
    <>
      <span
        aria-hidden="true"
        className="h-11 w-full basis-full md:w-40 md:basis-auto"
      />
      <span aria-hidden="true" className="h-11 flex-1 md:w-32 md:flex-none" />
      <MenuPlaceholder />
    </>
  ) : (
    <span aria-hidden="true" className="h-11 flex-1 md:w-32 md:flex-none" />
  );

/** Without the chunk the author can still edit a draft: a plain link, no publish. */
function EditOnly({ id }: { id: string }) {
  const t = useTranslations('vacancies');
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="h-11 flex-1 md:flex-none"
    >
      <Link href={vacancyEditHref(id)}>
        <Pencil aria-hidden="true" />
        {t('draft.actions.edit')}
      </Link>
    </Button>
  );
}

/** Header actions of an own draft in the preview and on the card (spec §6.2). The caller gates on `ownDraftActions`, which is synchronous: nothing loads for a vacancy that is not the viewer's draft. */
export function DraftHeaderActions({
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
  return (
    <LoadBoundary
      fallback={plan.stage === 'DRAFT' ? <EditOnly id={vacancy.id} /> : null}
    >
      <Suspense fallback={<ActionsPlaceholder stage={plan.stage} />}>
        <DraftActionButtons
          vacancy={vacancy}
          plan={plan}
          preview={preview}
          card={card}
          publishRef={publishRef}
        />
      </Suspense>
    </LoadBoundary>
  );
}
