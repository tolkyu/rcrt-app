'use client';

import { ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useId, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { AUDIT_SYSTEM_ACTOR } from '@/lib/audit-constants';
import { loadOrReload } from '@/lib/load-or-reload';
import type { AuditActor } from '@/lib/schemas/audit';

const loadCombobox = () => import('./audit-actor-combobox');
const AuditActorCombobox = dynamic(
  () => loadOrReload(loadCombobox).then((module) => module.AuditActorCombobox),
  { ssr: false },
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
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  /** `undefined` until first opened, so the chunk is not requested on page load. */
  const [open, setOpen] = useState<boolean>();
  const preload = () => void loadCombobox().catch(() => undefined);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label id={`${id}-label`} htmlFor={id} className="text-xs">
        {t('columns.actor')}
      </Label>
      <div className="relative">
        <button
          ref={trigger}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={!!open}
          aria-labelledby={`${id}-label ${id}`}
          onPointerEnter={preload}
          onFocus={preload}
          onClick={() => setOpen(!open)}
          className={`${className} flex items-center pr-12 text-left md:pr-10`}
        >
          <span className="truncate">
            {value === AUDIT_SYSTEM_ACTOR && (
              <span aria-hidden="true" className="mr-1">
                {t('systemMark')}
              </span>
            )}
            {label ?? t('filters.all')}
          </span>
        </button>
        {value ? (
          <button
            type="button"
            aria-label={t('filters.actorClear')}
            onClick={() => {
              onSelect(undefined, null);
              trigger.current?.focus();
            }}
            className="hover:bg-surface-muted absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md md:right-1 md:size-8"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
        )}
      </div>
      {open !== undefined && (
        <AuditActorCombobox
          anchor={trigger}
          open={open}
          onOpenChange={setOpen}
          value={value}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
