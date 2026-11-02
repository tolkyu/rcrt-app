'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { userInviteRequests } from '@/lib/queries/user-detail';
import { queryKeys } from '@/lib/query-keys';
import type { UserDetail } from '@/lib/schemas/user';
import { toast } from '@/lib/toast';

type Confirm = 'revoke' | 'reinvite';

/**
 * Drawer footer for invite states (wireframe §1.3, §1.7, D70): pending/expired → resend + revoke,
 * revoked → re-invite. Buttons stay disabled until the refetched card shows the new state.
 */
export function UserInviteActions({
  detail,
  onFocusHeading,
}: {
  detail: UserDetail;
  /** The pressed button disappears once the state changes, so focus moves to the card heading. */
  onFocusHeading: () => void;
}) {
  const t = useTranslations('settings.users.drawer');
  const tUsers = useTranslations('settings.users');
  const tCommon = useTranslations('settings.common');
  const roleLabel = useRoleLabel();
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const focusHeadingOnClose = useRef(false);
  const userId = detail.id;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.settingsUser(userId),
      }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
    ]);

  const onError = async (error: Error) => {
    if (error instanceof ApiError && error.code === 'INVITE_ROLES_INVALID') {
      toast.error(t('rolesInvalid'));
    } else if (
      error instanceof ApiError &&
      (error.status === 409 || error.status === 404)
    ) {
      toast.error(tCommon('conflict'));
      focusHeadingOnClose.current = true;
    } else {
      toast.error(tCommon('saveFailed'));
      return;
    }
    setConfirm(null);
    await refresh();
    if (focusHeadingOnClose.current) onFocusHeading();
  };

  const closeAfterSuccess = () => {
    focusHeadingOnClose.current = true;
    setConfirm(null);
    return refresh();
  };

  const resend = useMutation({
    mutationFn: () => userInviteRequests.resend(userId),
    onSuccess: async (sent) => {
      if (sent.delivered)
        toast.success(t('resendToast', { at: new Date(sent.expiresAt) }));
      else toast.error(t('resendNotDelivered'));
      await refresh();
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: () => userInviteRequests.revoke(userId),
    onSuccess: async () => {
      toast.success(t('revokeDialog.toast'));
      await closeAfterSuccess();
    },
    onError,
  });
  const reinvite = useMutation({
    mutationFn: () => userInviteRequests.reinvite(userId),
    onSuccess: async (sent) => {
      if (sent.delivered)
        toast.success(
          t('reinviteDialog.toast', { at: new Date(sent.expiresAt) }),
        );
      else toast.error(t('reinviteDialog.notDelivered'));
      await closeAfterSuccess();
    },
    onError,
  });

  const busy = resend.isPending || revoke.isPending || reinvite.isPending;
  const noRoles = detail.roles.length === 0;
  const submitting = tUsers('inviteDialog.submitting');
  const pending =
    detail.status === 'INVITED' || detail.status === 'INVITE_EXPIRED';
  if (!pending && detail.status !== 'REVOKED') return null;

  const dialogProps = (kind: Confirm) => ({
    open: confirm === kind,
    onOpenChange: (open: boolean) => {
      if (busy) return;
      focusHeadingOnClose.current = false;
      setConfirm(open ? kind : null);
    },
  });
  const contentProps = {
    onEscapeKeyDown: (event: KeyboardEvent) => event.preventDefault(),
    // Radix attaches its Escape listener to a new layer only after a re-render, so a fast Escape would be lost.
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      focusHeadingOnClose.current = false;
      setConfirm(null);
    },
    onCloseAutoFocus: (event: Event) => {
      if (!focusHeadingOnClose.current) return;
      event.preventDefault();
      onFocusHeading();
    },
  };
  const roles = detail.roles
    .map((r) => roleLabel(r.role, r.vertical?.name ?? null))
    .join(', ');

  return (
    <div
      role="group"
      aria-label={t('actionsLabel')}
      className="border-border bg-surface sticky bottom-0 -mx-6 mt-auto -mb-6 flex flex-col gap-2 border-t px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {pending ? (
          <>
            <Button
              variant="secondary"
              className="h-12 sm:h-10"
              disabled={busy || noRoles}
              aria-busy={resend.isPending}
              aria-describedby={noRoles ? reasonId : undefined}
              onClick={() => resend.mutate()}
            >
              {resend.isPending ? submitting : t('resend')}
            </Button>
            <AlertDialog {...dialogProps('revoke')}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive-soft"
                  className="h-12 sm:h-10"
                  disabled={busy}
                >
                  {t('revoke')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent {...contentProps}>
                <AlertDialogTitle>
                  {t('revokeDialog.title', { name: detail.fullName })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('revokeDialog.body')}
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button variant="outline" disabled={busy}>
                      {tCommon('cancel')}
                    </Button>
                  </AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    aria-busy={revoke.isPending}
                    onClick={() => revoke.mutate()}
                  >
                    {revoke.isPending
                      ? tCommon('saving')
                      : t('revokeDialog.submit')}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <AlertDialog {...dialogProps('reinvite')}>
            <AlertDialogTrigger asChild>
              <Button
                className="h-12 sm:h-10"
                disabled={busy || noRoles}
                aria-describedby={noRoles ? reasonId : undefined}
              >
                {t('reinvite')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent {...contentProps}>
              <AlertDialogTitle>
                {t('reinviteDialog.title', { name: detail.fullName })}
              </AlertDialogTitle>
              <AlertDialogDescription className="[overflow-wrap:anywhere]">
                {t('reinviteDialog.body', { email: detail.email })}
              </AlertDialogDescription>
              <p className="text-foreground text-sm [overflow-wrap:anywhere]">
                {t('reinviteDialog.roles', { roles })}
              </p>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline" disabled={busy}>
                    {tCommon('cancel')}
                  </Button>
                </AlertDialogCancel>
                <Button
                  disabled={busy}
                  aria-busy={reinvite.isPending}
                  onClick={() => reinvite.mutate()}
                >
                  {reinvite.isPending ? submitting : t('reinviteDialog.submit')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {noRoles && (
        <p id={reasonId} className="text-muted-foreground text-xs">
          {t('noRolesReason')}
        </p>
      )}
    </div>
  );
}
