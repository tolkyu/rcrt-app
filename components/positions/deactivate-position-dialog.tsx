'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import type { Position } from '@/lib/schemas/position';
import { toast } from '@/lib/toast';
import {
  classifyFailure,
  refreshPosition,
  usePositionFailureToast,
  usePositionToggle,
} from './position-write';

/** Open vacancies never block (ADR-013); the row flips at once behind the dialog, which closes when the server confirms. */
export function DeactivatePositionDialog({
  target,
  focusAfter,
  onClose,
  onCloseAutoFocus,
}: {
  target: Position;
  focusAfter: string;
  onClose: (focusKey?: string) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const t = useTranslations('positions');
  const tCommon = useTranslations('settings.common');
  const notifyFailure = usePositionFailureToast();
  const queryClient = useQueryClient();
  const list = useQuery(positionsQuery(MANAGER_POSITIONS));
  const live = list.data?.items.find((item) => item.id === target.id) ?? target;
  const toggle = usePositionToggle();
  const [stale, setStale] = useState(false);
  const pending = toggle.isPending;
  const openCount = live.openVacanciesCount ?? 0;

  const confirm = () => {
    setStale(false);
    toggle.mutate(
      { position: live, isActive: false },
      {
        onSuccess: () => onClose(focusAfter),
        onError: async (error) => {
          const failure = classifyFailure(error);
          if (failure === 'mfaRequired') return onClose();
          if (failure === 'stale') {
            const row = await refreshPosition(queryClient, target.id);
            if (row?.isActive) return setStale(true);
            if (row) toast.success(t('toast.alreadyInactive'));
            else toast.error(t('errors.notFound'));
            return onClose();
          }
          notifyFailure(failure);
          if (failure === 'notFound') {
            void refreshPosition(queryClient, target.id);
            onClose();
          }
        },
      },
    );
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogTitle>
          {t('deactivateDialog.title', { name: live.name })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t('deactivateDialog.description')}
        </AlertDialogDescription>
        {openCount > 0 && (
          <div className="bg-warning-subtle text-warning-text flex items-start gap-2 rounded-lg p-3 text-sm">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {t('deactivateDialog.openWarning', { count: openCount })}
          </div>
        )}
        <p className="text-muted-foreground text-sm">
          {t('deactivateDialog.reversible')}
        </p>
        {stale && (
          <div
            role="alert"
            className="bg-warning-subtle text-warning-text flex items-start gap-2 rounded-lg p-3 text-sm"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {t('errors.stale')}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={pending}>
              {tCommon('cancel')}
            </Button>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? tCommon('saving') : t('deactivateDialog.submit')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
