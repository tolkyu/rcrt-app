'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validAuditPeriod } from '@/lib/audit-filters';

export function AuditDateFilter({
  from,
  to,
  error,
  setFrom,
  setTo,
  setError,
  onApply,
}: {
  from: string;
  to: string;
  error: boolean;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  setError: (value: boolean) => void;
  onApply: () => void;
}) {
  const t = useTranslations('settings.audit');
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!validAuditPeriod(from, to)) {
          setError(true);
          return;
        }
        setError(false);
        onApply();
      }}
    >
      <Label className="flex flex-col gap-1">
        {t('filters.from')}
        <Input
          type="date"
          required
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-invalid={error}
        />
      </Label>
      <Label className="flex flex-col gap-1">
        {t('filters.to')}
        <Input
          type="date"
          required
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-invalid={error}
        />
      </Label>
      <Button type="submit" variant="outline">
        {t('filters.apply')}
      </Button>
      {error && (
        <p role="alert" className="text-error-text w-full text-sm">
          {t('filters.invalidPeriod')}
        </p>
      )}
    </form>
  );
}
