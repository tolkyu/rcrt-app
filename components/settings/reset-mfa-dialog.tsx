'use client';

import { useIsMutating, useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api-client';
import {
  useRefreshUserCard,
  userCardMutationKey,
} from '@/lib/queries/user-detail';
import { mfaResetResponseSchema, mfaResetSchema } from '@/lib/schemas/auth';
import type { UserDetail } from '@/lib/schemas/user';
import { toast } from '@/lib/toast';
import { useNestedDialog } from './invite-dialog-behaviour';

export function ResetMfaDialog({
  detail,
  onClose,
  onFocusHeading,
  onFocusTrigger,
}: {
  detail: UserDetail;
  onClose: () => void;
  onFocusHeading: () => void;
  onFocusTrigger: () => void;
}) {
  const t = useTranslations('settings.users.drawer.resetMfa');
  const tCommon = useTranslations('common');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<'incomplete' | 'failed' | null>(null);
  const reasonId = useId();
  const refresh = useRefreshUserCard(detail.id);
  const busy =
    useIsMutating({ mutationKey: userCardMutationKey(detail.id) }) > 0;
  const mutation = useMutation({
    mutationKey: [...userCardMutationKey(detail.id), 'mfa-reset'],
    mutationFn: () =>
      apiRequest(`/users/${detail.id}/mfa-reset`, {
        method: 'POST',
        body: { reason: reason.trim() },
        schema: mfaResetResponseSchema,
      }),
    onSuccess: () => {
      void refresh();
      focusHeadingRef.current = true;
      toast.success(t('saved'));
      onClose();
    },
    onError: (error) => {
      void refresh();
      setFailure(
        error instanceof ApiError && error.code === 'MFA_RESET_INCOMPLETE'
          ? 'incomplete'
          : 'failed',
      );
    },
  });
  const { contentProps, focusHeadingRef } = useNestedDialog({
    busy,
    close: onClose,
    onFocusHeading,
    onFocusFallback: onFocusTrigger,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const valid = mfaResetSchema.safeParse({ reason }).success;
    setInvalid(!valid);
    if (!valid || busy) return;
    setFailure(null);
    mutation.mutate();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent closeLabel={tCommon('close')} {...contentProps}>
        <DialogTitle>{t('title', { name: detail.fullName })}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{t('reason')}</Label>
            <textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              rows={3}
              aria-required="true"
              aria-invalid={invalid || undefined}
              aria-describedby={`${reasonId}-hint${invalid ? ` ${reasonId}-error` : ''}`}
              className="border-input bg-surface text-foreground min-h-24 rounded-lg border px-3 py-2 text-base md:text-sm"
              onChange={(event) => {
                setReason(event.target.value);
                setInvalid(false);
              }}
            />
            <p
              id={`${reasonId}-hint`}
              className="text-muted-foreground text-xs"
            >
              {t('reasonHint')}
            </p>
            {invalid && (
              <p id={`${reasonId}-error`} className="text-error-text text-sm">
                {t('reasonInvalid')}
              </p>
            )}
          </div>
          {failure && (
            <p role="alert" className="text-error-text text-sm">
              {t(failure)}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end [&>button]:h-12 sm:[&>button]:h-10">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {t(busy ? 'saving' : 'submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
