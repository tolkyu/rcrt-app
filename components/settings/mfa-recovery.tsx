'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

/** Keep verification reachable inside the active modal's focus trap. */
export function MfaRecovery({ next }: { next: string }) {
  const t = useTranslations('settings');
  const [dialog, setDialog] = useState(
    () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        ),
      ).at(-1) ?? null,
  );
  useEffect(() => {
    if (!dialog) return;
    const moveToPage = () => {
      if (!dialog.isConnected || dialog.dataset.state !== 'open')
        setDialog(null);
    };
    const observer = new MutationObserver(moveToPage);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    moveToPage();
    return () => observer.disconnect();
  }, [dialog]);
  const alert = (
    <div
      role="alert"
      className="border-warning bg-warning/10 mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-foreground text-sm">{t('mfaRequired')}</p>
      <Button asChild variant="outline" className="h-11 shrink-0">
        <Link href={`/mfa/verify?next=${encodeURIComponent(next)}`}>
          {t('verifyMfa')}
        </Link>
      </Button>
    </div>
  );
  return dialog ? createPortal(alert, dialog) : alert;
}
