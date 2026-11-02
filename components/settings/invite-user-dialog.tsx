'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Mail,
  Send,
  ShieldCheck,
  UserPlus,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
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
import { ApiError, apiRequest, type ApiFieldError } from '@/lib/api-client';
import { FULL_NAME_MAX } from '@/lib/profile-name';
import { settingsUsersKey } from '@/lib/queries/user-detail';
import { sortRoles } from '@/lib/roles';
import {
  createInviteResponseSchema,
  createInviteSchema,
} from '@/lib/schemas/auth';
import { EMAIL_MAX_LENGTH } from '@/lib/schemas/email';
import { toast } from '@/lib/toast';
import { RoleChips } from './role-chips';
import { RoleMatrix, isGlobalRole, parseRoleKey } from './role-matrix';

/** Pasted names often carry stray spaces; the schema collapses them, so allow some slack before the cap. */
const NAME_INPUT_MAX = FULL_NAME_MAX + 20;
const CONFLICTS = {
  USER_EXISTS: 'userExists',
  INVITE_PENDING: 'invitePending',
  INVITE_ALREADY_PENDING: 'invitePending',
  USER_DEACTIVATED: 'userDeactivated',
  INVITE_REVOKED: 'inviteRevoked',
} as const;

interface InvitePayload {
  readonly fullName: string;
  readonly email: string;
  readonly roles: readonly { role: string; verticalId: string | null }[];
}

type Field = 'fullName' | 'email' | 'roles';
type FieldError =
  | 'nameRequired'
  | 'nameTooLong'
  | 'emailRequired'
  | 'emailInvalid'
  | 'rolesRequired'
  | 'rolesInvalid'
  | (typeof CONFLICTS)[keyof typeof CONFLICTS];
type Errors = Partial<Record<Field, FieldError>>;

const without = (errors: Errors, field: Field): Errors => {
  const next = { ...errors };
  delete next[field];
  return next;
};

function clientErrors(
  fullName: string,
  email: string,
  roles: number,
): Errors | null {
  const parsed = createInviteSchema.safeParse({
    fullName,
    email,
    roles: Array.from({ length: roles }, () => ({
      role: 'ADMIN',
      verticalId: null,
    })),
  });
  if (parsed.success) return null;
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'fullName' && !errors.fullName)
      errors.fullName =
        issue.code === 'too_big' ? 'nameTooLong' : 'nameRequired';
    if (field === 'email' && !errors.email)
      errors.email = email.trim() ? 'emailInvalid' : 'emailRequired';
    if (field === 'roles' && !errors.roles) errors.roles = 'rolesRequired';
  }
  return errors;
}

function serverFieldErrors(fields: readonly ApiFieldError[]): Errors {
  const errors: Errors = {};
  for (const { path } of fields) {
    if (path.startsWith('body.fullName')) errors.fullName = 'nameRequired';
    if (path.startsWith('body.email')) errors.email = 'emailInvalid';
    if (path.startsWith('body.roles')) errors.roles = 'rolesInvalid';
  }
  return errors;
}

/** «Запросити користувача» (STORY-ROLE-05-1, wireframe §1.2, designer mockup Q-155): roles × verticals, summary, 409s in place. */
export function InviteUserDialog({
  verticals,
  verticalsState,
  onRetryVerticals,
  canManageVerticals,
  onClose,
  onShowUser,
  onOpenUser,
}: {
  verticals: readonly { id: string; name: string }[];
  /** «No verticals» is shown only for a loaded empty list, never while loading or after a failed fetch. */
  verticalsState: 'pending' | 'error' | 'success';
  onRetryVerticals: () => void;
  canManageVerticals: boolean;
  onClose: () => void;
  onShowUser: (email: string) => void;
  /** The deactivated holder of the address: its card offers «Активувати знову» (D42, wireframe §1.2). */
  onOpenUser: (email: string, userId: string) => void;
}) {
  const t = useTranslations('settings.users.inviteDialog');
  const tCommon = useTranslations('settings.common');
  const tClose = useTranslations('common');
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Errors>({});
  const [deactivatedUserId, setDeactivatedUserId] = useState<string | null>(
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const rolesRef = useRef<HTMLDivElement>(null);
  /** Inputs are disabled while sending, so focus moves only after the request settles. */
  const refocus = useRef<HTMLElement | null>(null);
  const verticalName = new Map(verticals.map((v) => [v.id, v.name]));

  const assignments = sortRoles(
    [...selected].map((key) => {
      const { role, verticalId } = parseRoleKey(key);
      const name = verticalId ? verticalName.get(verticalId) : undefined;
      return {
        role,
        verticalId,
        vertical: verticalId && name ? { id: verticalId, name } : null,
      };
    }),
  );
  const needsMfa = assignments.some((a) => isGlobalRole(a.role));

  const toggle = (key: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    if (errors.roles) setErrors((current) => without(current, 'roles'));
  };

  const invite = useMutation({
    mutationFn: (payload: InvitePayload) =>
      apiRequest('/invites', {
        method: 'POST',
        body: payload,
        schema: createInviteResponseSchema,
      }),
    onSuccess: (created, payload) => {
      void queryClient.invalidateQueries({ queryKey: settingsUsersKey });
      if (created.delivered)
        toast.success(
          t('toastSent', {
            email: payload.email.trim().toLowerCase(),
            at: new Date(created.expiresAt),
          }),
        );
      else toast.error(t('toastNotDelivered'));
      onClose();
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        const conflict = Object.hasOwn(CONFLICTS, failure.code)
          ? CONFLICTS[failure.code as keyof typeof CONFLICTS]
          : undefined;
        if (conflict) {
          setErrors({ email: conflict });
          setDeactivatedUserId(failure.details.userId ?? null);
          refocus.current = emailRef.current;
          return;
        }
      }
      if (failure instanceof ApiError && failure.status === 400) {
        const fieldErrors = serverFieldErrors(failure.fieldErrors);
        if (Object.keys(fieldErrors).length) return setErrors(fieldErrors);
      }
      toast.error(tCommon('saveFailed'));
    },
  });

  useEffect(() => {
    if (invite.isPending || !refocus.current) return;
    refocus.current.focus();
    refocus.current = null;
  }, [invite.isPending]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invite.isPending) return;
    const problems = clientErrors(fullName, email, assignments.length);
    setErrors(problems ?? {});
    if (problems?.fullName) return nameRef.current?.focus();
    if (problems?.email) return emailRef.current?.focus();
    if (problems?.roles)
      return rolesRef.current?.querySelector('input')?.focus();
    invite.mutate({
      fullName,
      email,
      roles: assignments.map(({ role, verticalId }) => ({ role, verticalId })),
    });
  };

  const errorText = (field: Field) => {
    const code = errors[field];
    return code
      ? t(
          `errors.${code}`,
          code === 'nameTooLong' ? { max: FULL_NAME_MAX } : {},
        )
      : null;
  };
  const emailConflict =
    errors.email === 'userExists' ||
    errors.email === 'invitePending' ||
    errors.email === 'userDeactivated' ||
    errors.email === 'inviteRevoked';
  const reactivateId =
    errors.email === 'userDeactivated' ? deactivatedUserId : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !invite.isPending && onClose()}
    >
      <DialogContent
        closeLabel={tClose('close')}
        className="md:w-[min(60rem,calc(100vw-2rem))]"
      >
        <div className="flex items-start gap-4 pr-10">
          <span
            aria-hidden="true"
            className="bg-primary-subtle text-link hidden size-12 shrink-0 items-center justify-center rounded-xl sm:flex"
          >
            <UserPlus className="size-6" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="pr-0">{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <fieldset disabled={invite.isPending} className="contents">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="flex min-w-0 flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="invite-name">{t('nameLabel')}</Label>
                    <Input
                      ref={nameRef}
                      id="invite-name"
                      autoComplete="off"
                      value={fullName}
                      maxLength={NAME_INPUT_MAX}
                      placeholder={t('namePlaceholder')}
                      aria-invalid={errors.fullName ? true : undefined}
                      aria-describedby={
                        errors.fullName ? 'invite-name-error' : undefined
                      }
                      onChange={(event) => {
                        setFullName(event.target.value);
                        if (errors.fullName)
                          setErrors((current) => without(current, 'fullName'));
                      }}
                    />
                    {errors.fullName && (
                      <p
                        id="invite-name-error"
                        className="text-error-text text-sm"
                      >
                        {errorText('fullName')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="invite-email">{t('emailLabel')}</Label>
                    <div className="relative">
                      <Mail
                        aria-hidden="true"
                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                      />
                      <Input
                        ref={emailRef}
                        id="invite-email"
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        value={email}
                        maxLength={EMAIL_MAX_LENGTH}
                        placeholder={t('emailPlaceholder')}
                        className="pl-9"
                        aria-invalid={errors.email ? true : undefined}
                        aria-describedby={
                          errors.email
                            ? 'invite-email-error invite-email-hint'
                            : 'invite-email-hint'
                        }
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (errors.email)
                            setErrors((current) => without(current, 'email'));
                        }}
                      />
                    </div>
                    {errors.email && (
                      <div
                        id="invite-email-error"
                        className="flex flex-col gap-1"
                      >
                        <p className="text-error-text text-sm">
                          {errorText('email')}
                        </p>
                        {emailConflict && (
                          <button
                            type="button"
                            className="text-link self-start text-sm font-medium hover:underline"
                            onClick={() =>
                              reactivateId
                                ? onOpenUser(
                                    email.trim().toLowerCase(),
                                    reactivateId,
                                  )
                                : onShowUser(email.trim().toLowerCase())
                            }
                          >
                            {t(
                              reactivateId
                                ? 'errors.reactivateInstead'
                                : 'errors.showInList',
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    <p
                      id="invite-email-hint"
                      className="text-muted-foreground text-xs"
                    >
                      {t('emailHint')}
                    </p>
                  </div>
                </div>

                <fieldset
                  className="flex min-w-0 flex-col gap-3"
                  aria-describedby={
                    errors.roles
                      ? 'invite-roles-error invite-roles-hint'
                      : 'invite-roles-hint'
                  }
                >
                  <legend className="text-foreground mb-1 text-base font-semibold">
                    {t('rolesTitle')}
                  </legend>
                  <p
                    id="invite-roles-hint"
                    className="text-muted-foreground text-xs"
                  >
                    {t('rolesHint')}
                  </p>
                  <RoleMatrix
                    ref={rolesRef}
                    verticals={verticals}
                    verticalsState={verticalsState}
                    onRetryVerticals={onRetryVerticals}
                    canManageVerticals={canManageVerticals}
                    selected={selected}
                    onToggle={toggle}
                    invalid={Boolean(errors.roles)}
                  />
                  {errors.roles && (
                    <p
                      id="invite-roles-error"
                      className="text-error-text text-sm"
                    >
                      {errorText('roles')}
                    </p>
                  )}
                </fieldset>
              </div>

              <aside
                aria-labelledby="invite-summary-title"
                className="border-border bg-surface-muted flex flex-col gap-4 rounded-xl border p-4 lg:self-start"
              >
                <h3
                  id="invite-summary-title"
                  className="text-foreground text-base font-semibold"
                >
                  {t('summaryTitle')}
                </h3>
                <div className="flex items-center gap-3">
                  {fullName.trim() ? (
                    <Avatar name={fullName} className="size-12 text-base" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="bg-primary-subtle text-link flex size-12 shrink-0 items-center justify-center rounded-full"
                    >
                      <UserRound className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-foreground font-semibold [overflow-wrap:anywhere]">
                      {fullName.trim() || t('summaryNamePlaceholder')}
                    </p>
                    {email.trim() && (
                      <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                        <EmailText email={email.trim().toLowerCase()} />
                      </p>
                    )}
                    <span className="bg-warning/15 text-warning-text mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                      <span
                        aria-hidden="true"
                        className="bg-warning size-1.5 rounded-full"
                      />
                      {t('summaryPending')}
                    </span>
                  </div>
                </div>
                <div className="border-border flex flex-col gap-2 border-t pt-4">
                  <p className="text-muted-foreground text-xs font-medium">
                    {t('summaryRolesTitle')}
                  </p>
                  {assignments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t('summaryNoRoles')}
                    </p>
                  ) : (
                    <RoleChips
                      roles={assignments}
                      namedGlobal
                      marker={<Check className="size-3" aria-hidden="true" />}
                    />
                  )}
                  <p
                    className="text-muted-foreground text-xs"
                    aria-live="polite"
                  >
                    {assignments.length > 0 &&
                      t('selected', { count: assignments.length })}
                  </p>
                </div>
                {needsMfa && (
                  <p className="text-muted-foreground border-border flex items-start gap-2 border-t pt-4 text-xs">
                    <ShieldCheck
                      className="text-link size-4 shrink-0"
                      aria-hidden="true"
                    />
                    {t('summaryMfa')}
                  </p>
                )}
              </aside>
            </div>
          </fieldset>

          <div className="border-border flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between [&>button]:h-12 sm:[&>button]:h-10">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={invite.isPending}
            >
              <XCircle aria-hidden="true" />
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              <Send aria-hidden="true" />
              {invite.isPending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
