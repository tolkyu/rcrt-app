'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormAlert } from '@/components/vacancies/form-alert';

/** Persistent warning of a 409 `STALE_STATE`: the typed values stay, and the author decides whether to drop them for the stored version; loaded only when it appears (PERF-04). */
export function StaleAlert({
  dirty,
  busy,
  onReload,
}: {
  dirty: boolean;
  busy: boolean;
  onReload: () => void;
}) {
  const t = useTranslations('vacancyForm.edit');
  const [asking, setAsking] = useState(false);
  const alert = useRef<HTMLDivElement>(null);
  // The press that failed was on the footer: the warning above the form must come into view.
  useEffect(() => {
    alert.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <>
      <div ref={alert} className="scroll-mt-20">
        <FormAlert
          tone="warning"
          action={
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-10"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (busy) return;
                if (dirty) setAsking(true);
                else onReload();
              }}
            >
              {t('stale.reload')}
            </Button>
          }
        >
          <strong className="block">{t('toast.stale')}</strong>
          {t('toast.staleDescription')}
        </FormAlert>
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        tone="destructive"
        title={t('stale.confirmTitle')}
        description={t('stale.confirmDescription')}
        confirmLabel={t('stale.confirmAction')}
        cancelLabel={t('stale.confirmStay')}
        onConfirm={() => {
          setAsking(false);
          onReload();
        }}
      />
    </>
  );
}
