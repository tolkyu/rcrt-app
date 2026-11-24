'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** «Є незбережені зміни» before a tab switch or in-app link drops the drafts (wireframe P1.1 #16); lazy-loaded. */
export function PrioritiesLeaveDialog({
  vertical,
  onStay,
  onDiscard,
}: {
  vertical: string;
  onStay: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations('settings.priorities.leaveDialog');
  return (
    <AlertDialog open onOpenChange={(open) => !open && onStay()}>
      <AlertDialogContent>
        <AlertDialogTitle>{t('title')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('body', { vertical })}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">{t('stay')}</Button>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onDiscard}>
            {t('discard')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
