'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MfaRequiredAlert } from '@/components/states/mfa-required-alert';

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
  const alert = <MfaRequiredAlert message={t('mfaRequired')} next={next} />;
  return dialog ? createPortal(alert, dialog) : alert;
}
