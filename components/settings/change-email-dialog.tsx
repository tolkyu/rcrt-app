'use client';

import { useIsMutating, useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import { Button } from '@/components/ui/button';
import { EmailText } from '@/components/ui/email-text';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import {
  useAdoptUserVersion,
  useRefreshUserCard,
  userInviteMutationKey,
  userInviteRequests,
} from '@/lib/queries/user-detail';
import { EMAIL_MAX_LENGTH, emailAddressSchema } from '@/lib/schemas/email';
import type { UserDetail } from '@/lib/schemas/user';
import { toast } from '@/lib/toast';
import { useInviteFailure, useNestedDialog } from './invite-dialog-behaviour';

/** Address-taken answers reuse the invite dialog copy (STORY-ROLE-05-1). */
const TAKEN = {
  USER_EXISTS: 'userExists',
  INVITE_PENDING: 'invitePending',
  USER_DEACTIVATED: 'userDeactivated',
  INVITE_REVOKED: 'inviteRevoked',
} as const;
type Taken = (typeof TAKEN)[keyof typeof TAKEN];
type EmailError = 'emailRequired' | 'emailInvalid' | 'unchanged' | Taken;

const normalize = (value: string) => value.trim().toLowerCase();

function formatError(value: string): 'emailRequired' | 'emailInvalid' | null {
  if (!value.trim()) return 'emailRequired';
  return emailAddressSchema.safeParse(value).success ? null : 'emailInvalid';
}

/** «Змінити email» (STORY-ROLE-05-7, wireframe §1.11): no optimistic update — uniqueness and the letter are server truths. */
export function ChangeEmailDialog({
  detail,
  onClose,
  onFocusHeading,
  onFocusTrigger,
  onShowUser,
}: {
  detail: UserDetail;
  onClose: () => void;
  onFocusHeading: () => void;
  onFocusTrigger: () => void;
  onShowUser: (email: string) => void;
}) {
  const t = useTranslations('settings.users.drawer');
  const tInvite = useTranslations('settings.users.inviteDialog');
  const tCommon = useTranslations('settings.common');
  const tClose = useTranslations('common');
  const roleLabel = useRoleLabel();
  const refresh = useRefreshUserCard(detail.id);
  const adoptVersion = useAdoptUserVersion(detail.id);
  const inviteFailure = useInviteFailure();
  const mutationKey = userInviteMutationKey(detail.id);
  const busy = useIsMutating({ mutationKey }) > 0;
  const close = () => {
    if (busy) return;
    onClose();
  };
  const { focusHeadingRef, contentProps } = useNestedDialog({
    busy,
    close,
    onFocusHeading,
    onFocusFallback: onFocusTrigger,
  });
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(detail.email);
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<EmailError | null>(null);
  /** Server-side field errors are announced (role="alert"); client checks only describe the field. */
  const [fromServer, setFromServer] = useState(false);
  const unchanged = normalize(value) === detail.email;

  const change = useMutation({
    mutationKey,
    mutationFn: (email: string) =>
      userInviteRequests.changeEmail(detail.id, email, detail.version),
    onSuccess: async (sent, email) => {
      adoptVersion(sent.version, { email });
      if (sent.delivered)
        toast.success(
          t('changeEmail.toast', { email, at: new Date(sent.expiresAt) }),
        );
      else toast.error(t('changeEmail.notDelivered'));
      focusHeadingRef.current = true;
      onClose();
      await refresh();
    },
    onError: async (failure) => {
      const onEmail =
        failure instanceof ApiError &&
        failure.fieldErrors.some((f) => f.path === 'body.email');
      if (onEmail && (failure.status === 409 || failure.status === 400)) {
        setError(
          failure.status === 400
            ? failure.code === 'EMAIL_UNCHANGED'
              ? 'unchanged'
              : 'emailInvalid'
            : Object.hasOwn(TAKEN, failure.code)
              ? TAKEN[failure.code as keyof typeof TAKEN]
              : 'userExists',
        );
        setFromServer(true);
        input.current?.focus();
        return;
      }
      if (!inviteFailure(failure)) return;
      focusHeadingRef.current = true;
      onClose();
      await refresh();
    },
  });
  const pending = change.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEdited(true);
    if (pending || unchanged) return;
    const problem = formatError(value);
    setError(problem);
    setFromServer(false);
    if (problem) return input.current?.focus();
    change.mutate(normalize(value));
  };

  const shown: EmailError | null =
    error ?? (edited && unchanged ? 'unchanged' : null);
  const taken = shown !== null && Object.values(TAKEN).includes(shown as Taken);
  const message = shown
    ? shown === 'unchanged'
      ? t('changeEmail.errors.unchanged')
      : tInvite(`errors.${shown}`)
    : null;
  const roles = detail.roles
    .map((r) => roleLabel(r.role, r.vertical?.name ?? null))
    .join(', ');

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        closeLabel={tClose('close')}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
          input.current?.select();
        }}
        {...contentProps}
      >
        <DialogTitle className="[overflow-wrap:anywhere]">
          {t('changeEmail.title', { name: detail.fullName })}
        </DialogTitle>
        <DialogDescription>{t('changeEmail.description')}</DialogDescription>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <dl className="flex flex-col gap-1">
            <dt className="text-foreground text-sm font-medium">
              {t('changeEmail.currentLabel')}
            </dt>
            <dd className="text-foreground text-sm [overflow-wrap:anywhere]">
              <EmailText email={detail.email} />
            </dd>
          </dl>
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{t('changeEmail.newLabel')}</Label>
            <Input
              ref={input}
              id={inputId}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={value}
              maxLength={EMAIL_MAX_LENGTH}
              readOnly={pending}
              aria-required="true"
              aria-invalid={error && error !== 'unchanged' ? true : undefined}
              aria-describedby={shown ? `${errorId} ${hintId}` : hintId}
              onChange={(event) => {
                setValue(event.target.value);
                setEdited(true);
                if (error) setError(null);
                setFromServer(false);
              }}
              // Only edits reveal «unchanged»: opening inside the Sheet can blur and refocus the field once.
              onBlur={() => {
                if (error || unchanged) return;
                setError(formatError(value));
                setFromServer(false);
              }}
            />
            {shown && (
              <div id={errorId} className="flex flex-col gap-1">
                <p
                  role={fromServer && error ? 'alert' : undefined}
                  className={
                    shown === 'unchanged'
                      ? 'text-muted-foreground text-sm'
                      : 'text-error-text text-sm'
                  }
                >
                  {message}
                </p>
                {taken && (
                  <button
                    type="button"
                    className="text-link self-start text-sm font-medium hover:underline"
                    onClick={() => onShowUser(normalize(value))}
                  >
                    {tInvite('errors.showInList')}
                  </button>
                )}
              </div>
            )}
            <p id={hintId} className="text-muted-foreground text-xs">
              {tInvite('emailHint')}
            </p>
          </div>
          <p className="text-foreground text-sm [overflow-wrap:anywhere]">
            {t('reinviteDialog.roles', { roles })}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-12 sm:h-10"
              onClick={close}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              className="h-auto min-h-12 whitespace-normal sm:min-h-10"
              disabled={pending || unchanged}
              aria-busy={pending}
            >
              {pending ? tInvite('submitting') : t('changeEmail.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
