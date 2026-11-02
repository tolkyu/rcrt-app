'use client';

import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import {
  userActivationMutationKey,
  userActivationRequests,
  useRefreshUserCard,
} from '@/lib/queries/user-detail';
import { queryKeys } from '@/lib/query-keys';
import { roleAssignmentKey } from '@/lib/role-diff';
import type { UserDetail } from '@/lib/schemas/user';
import { toast } from '@/lib/toast';
import { useNestedDialog } from './invite-dialog-behaviour';

export function UserActivationDialog({
  detail,
  reactivate,
  onClose,
  onFocusHeading,
  onFocusTrigger,
}: {
  detail: UserDetail;
  reactivate: boolean;
  onClose: () => void;
  onFocusHeading: () => void;
  onFocusTrigger: () => void;
}) {
  const t = useTranslations('settings.users.drawer.activation');
  const tCommon = useTranslations('settings.common');
  const tClose = useTranslations('common');
  const roleLabel = useRoleLabel();
  const queryClient = useQueryClient();
  const refresh = useRefreshUserCard(detail.id);
  const [version, setVersion] = useState(detail.version);
  const [previous] = useState(() =>
    detail.roles.map((role) => ({
      ...role,
      verticalId: role.vertical?.id ?? null,
    })),
  );
  const [selected, setSelected] = useState(
    () => new Set(previous.map(roleAssignmentKey)),
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<'incomplete' | 'invalid' | null>(null);
  const reasonId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);
  const hintId = `${reasonId}-hint`;
  const mutationKey = userActivationMutationKey(detail.id);
  const busy = useIsMutating({ mutationKey }) > 0;
  const close = () => {
    if (!busy) onClose();
  };
  const { focusHeadingRef, contentProps } = useNestedDialog({
    busy,
    close,
    onFocusHeading,
    onFocusFallback: onFocusTrigger,
  });
  const finish = () => {
    focusHeadingRef.current = true;
    onClose();
  };
  const mutation = useMutation({
    mutationKey,
    mutationFn: () =>
      reactivate
        ? userActivationRequests.reactivate(
            detail.id,
            version,
            previous
              .filter((role) => selected.has(roleAssignmentKey(role)))
              .map(({ role, verticalId }) => ({ role, verticalId })),
          )
        : userActivationRequests.deactivate(detail.id, version, reason),
    onSuccess: () => {
      toast.success(
        t(reactivate ? 'reactivateToast' : 'deactivateToast', {
          name: detail.fullName,
        }),
      );
      finish();
    },
    onError: async (failure) => {
      if (
        failure instanceof ApiError &&
        failure.status === 503 &&
        (failure.code === 'DEACTIVATION_INCOMPLETE' ||
          failure.code === 'REACTIVATION_INCOMPLETE')
      ) {
        setError('incomplete');
        await refresh();
        const updated = queryClient.getQueryData<UserDetail>(
          queryKeys.settingsUser(detail.id),
        );
        if (updated) setVersion(updated.version);
        return;
      }
      if (failure instanceof ApiError && failure.status === 400) {
        setError('invalid');
        return;
      }
      if (
        failure instanceof ApiError &&
        (failure.status === 409 || failure.status === 404)
      ) {
        toast.error(
          failure.code === 'SELF_DEACTIVATION'
            ? t('selfReason')
            : failure.code === 'LAST_ADMIN'
              ? t('lastAdminReason')
              : tCommon('conflict'),
        );
        finish();
        return;
      }
      toast.error(tCommon('saveFailed'));
    },
    onSettled: (_data, failure) => {
      const status = failure instanceof ApiError ? failure.status : 0;
      // 400 changed nothing; the 503 branch has already refreshed the card to read the new version.
      return Promise.all([
        status === 400 || status === 503 ? null : refresh(),
        status === 400
          ? null
          : queryClient.invalidateQueries({
              queryKey: queryKeys.settingsVerticals(),
            }),
      ]);
    },
  });
  const pending = mutation.isPending;
  useEffect(() => {
    // The submit button was disabled while sending; give focus back so retry is one key press away.
    if (!pending && error) submitRef.current?.focus();
  }, [pending, error]);
  const errorMessage =
    error === 'incomplete'
      ? t(reactivate ? 'reactivateIncomplete' : 'deactivateIncomplete')
      : error === 'invalid'
        ? t(reactivate ? 'reactivateInvalid' : 'deactivateInvalid')
        : null;
  /** Local deactivation already committed on 503, so leaving is closing, not cancelling (wireframe §1.5). */
  const dismissLabel =
    error === 'incomplete' && !reactivate ? tClose('close') : tCommon('cancel');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending) {
      setError(null);
      mutation.mutate();
    }
  };
  const footer = (cancel: boolean) => (
    <>
      {cancel ? (
        <AlertDialogCancel asChild>
          <Button variant="outline" disabled={pending}>
            {dismissLabel}
          </Button>
        </AlertDialogCancel>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={close}
          disabled={pending}
        >
          {dismissLabel}
        </Button>
      )}
      <Button
        ref={submitRef}
        type="submit"
        variant={reactivate ? 'default' : 'destructive'}
        disabled={pending}
        aria-busy={pending}
      >
        {pending
          ? tCommon('saving')
          : t(
              reactivate
                ? 'reactivateSubmit'
                : error === 'incomplete'
                  ? 'retryDeactivate'
                  : 'deactivate',
            )}
      </Button>
    </>
  );
  if (reactivate)
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent closeLabel={tClose('close')} {...contentProps}>
          <DialogTitle className="[overflow-wrap:anywhere]">
            {t('reactivateTitle', { name: detail.fullName })}
          </DialogTitle>
          <DialogDescription>{t('reactivateBody')}</DialogDescription>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <fieldset disabled={pending} className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('rolesLabel')}</legend>
              {previous.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('noPreviousRoles')}
                </p>
              ) : (
                previous.map((assignment) => {
                  const key = roleAssignmentKey(assignment);
                  return (
                    <label
                      key={key}
                      className="flex min-h-11 items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        className="accent-primary size-5"
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                          setError(null);
                        }}
                      />
                      {roleLabel(
                        assignment.role,
                        assignment.vertical?.name ?? null,
                      )}
                    </label>
                  );
                })
              )}
            </fieldset>
            {previous.length > 0 && selected.size === 0 && (
              <p className="text-warning-text text-sm">{t('noRolesWarning')}</p>
            )}
            {errorMessage && (
              <p role="alert" className="text-error-text text-sm">
                {errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {footer(false)}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  return (
    <AlertDialog open onOpenChange={(open) => !open && close()}>
      <AlertDialogContent {...contentProps}>
        <AlertDialogTitle className="[overflow-wrap:anywhere]">
          {t('deactivateTitle', { name: detail.fullName })}
        </AlertDialogTitle>
        <AlertDialogDescription>{t('deactivateBody')}</AlertDialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <ul className="text-muted-foreground list-disc pl-5 text-sm">
            <li>{t('sessions')}</li>
            <li>{t('roles')}</li>
          </ul>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{t('reasonLabel')}</Label>
            <textarea
              id={reasonId}
              maxLength={500}
              rows={3}
              value={reason}
              disabled={pending}
              aria-describedby={hintId}
              onChange={(event) => setReason(event.target.value)}
              className="border-input bg-surface text-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-base focus-visible:ring-2 md:text-sm"
            />
            <div
              id={hintId}
              className="text-muted-foreground flex justify-between gap-3 text-xs"
            >
              <span>{t('reasonHint')}</span>
              <span>{t('reasonCount', { count: reason.length })}</span>
            </div>
          </div>
          {errorMessage && (
            <p role="alert" className="text-error-text text-sm">
              {errorMessage}
            </p>
          )}
          <AlertDialogFooter>{footer(true)}</AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
