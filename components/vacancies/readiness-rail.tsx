'use client';

import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';

const ITEMS = ['vertical', 'title', 'position'] as const;
export type ReadinessItem = (typeof ITEMS)[number];

/** What the author is told will happen after saving: the Recruiter is auto-assigned (D102), Admin and Head Recruiter assign recruiters on the card. */
function useAfterCreateText(assigner: boolean) {
  const t = useTranslations('vacancyForm');
  return t(assigner ? 'rail.afterCreateAssigner' : 'rail.afterCreateSelf');
}

/** Below the rail breakpoint the same note sits above the footer. */
export function AfterCreateNote({ assigner }: { assigner: boolean }) {
  const text = useAfterCreateText(assigner);
  return (
    <p
      data-slot="form-note"
      className="text-muted-foreground text-xs @min-[67rem]:hidden"
    >
      {text}
    </p>
  );
}

/** «Готовність до публікації»: what the form still lacks; it never takes input and updates silently (not a live region). */
export function ReadinessRail({
  ready,
  assigner,
}: {
  ready: Readonly<Record<ReadinessItem, boolean>>;
  assigner: boolean;
}) {
  const t = useTranslations('vacancyForm');
  const afterCreate = useAfterCreateText(assigner);
  return (
    <Card data-slot="readiness-rail" className="flex flex-col gap-4 p-5">
      <h2 className="text-foreground text-sm font-semibold">
        {t('rail.label')}
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {ITEMS.map((item) => (
          <li key={item} className="flex items-center gap-2">
            {ready[item] ? (
              <Check aria-hidden="true" className="text-success-text size-4" />
            ) : (
              <Circle
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
            )}
            <span
              className={
                ready[item] ? 'text-foreground' : 'text-muted-foreground'
              }
            >
              {t(`rail.${item}`)}
            </span>
            <span className="sr-only">
              {ready[item] ? t('rail.done') : t('rail.todo')}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">{t('rail.draftNote')}</p>
      <div className="border-border border-t pt-4">
        <p className="text-foreground text-xs font-medium">
          {t('rail.afterCreate')}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{afterCreate}</p>
      </div>
    </Card>
  );
}
