'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { loadOrReload } from '@/lib/load-or-reload';
import { AuditFilterTrigger } from './audit-filter-trigger';

const loadPicker = () => import('./audit-action-picker');
function ActionLoading() {
  const t = useTranslations('states');
  return (
    <div
      role="status"
      className="bg-popover border-border absolute top-full z-30 mt-1 w-full rounded-lg border p-4 text-sm shadow-md"
    >
      {t('loading')}
    </div>
  );
}
const AuditActionPicker = dynamic(
  () => loadOrReload(loadPicker).then((module) => module.AuditActionPicker),
  { ssr: false, loading: ActionLoading },
);

export function AuditActionFilter({
  value,
  valueLabel,
  summaryId,
  className,
  onSelect,
}: {
  value: readonly string[];
  valueLabel: string;
  summaryId: string;
  className: string;
  onSelect: (codes: readonly string[]) => void;
}) {
  const t = useTranslations('settings.audit');
  const preload = () => void loadPicker().catch(() => undefined);
  return (
    <AuditFilterTrigger
      label={t('filters.action')}
      value={valueLabel}
      selected={value.length > 0}
      summaryId={summaryId}
      controls
      clearLabel={t('filters.actionsClear')}
      className={className}
      preload={preload}
      onClear={() => onSelect([])}
      picker={AuditActionPicker}
      pickerProps={{ value, onSelect }}
    />
  );
}
