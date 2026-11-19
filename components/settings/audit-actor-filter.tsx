'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { AUDIT_SYSTEM_ACTOR } from '@/lib/audit-constants';
import { loadOrReload } from '@/lib/load-or-reload';
import type { AuditActor } from '@/lib/schemas/audit';
import { AuditFilterTrigger } from './audit-filter-trigger';

const loadCombobox = () => import('./audit-actor-combobox');
const AuditActorCombobox = dynamic(
  () => loadOrReload(loadCombobox).then((module) => module.AuditActorCombobox),
  { ssr: false },
);
const ActorPicker = (props: ComponentProps<typeof AuditActorCombobox>) => (
  <AuditActorCombobox {...props} />
);

/** Closed «Хто» filter is a plain button; the search popover is a separate chunk loaded on first hover/focus (PERF-04). */
export function AuditActorFilter({
  value,
  label,
  className,
  onSelect,
}: {
  value: string | undefined;
  label: string | null;
  className: string;
  onSelect: (value: string | undefined, actor: AuditActor | null) => void;
}) {
  const t = useTranslations('settings.audit');
  const preload = () => void loadCombobox().catch(() => undefined);

  return (
    <AuditFilterTrigger
      label={t('columns.actor')}
      value={
        <>
          {value === AUDIT_SYSTEM_ACTOR && (
            <span aria-hidden="true" className="mr-1">
              {t('systemMark')}
            </span>
          )}
          {label ?? t('filters.all')}
        </>
      }
      selected={!!value}
      clearLabel={t('filters.actorClear')}
      className={className}
      preload={preload}
      onClear={() => onSelect(undefined, null)}
      picker={ActorPicker}
      pickerProps={{ value, onSelect }}
    />
  );
}
