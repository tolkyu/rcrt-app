'use client';

import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type FormEvent } from 'react';
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
import { ApiError } from '@/lib/api-client';
import { settingsVerticalsQuery } from '@/lib/queries/settings';
import {
  updateUserRolesRequest,
  useRefreshUserCard,
  userRolesMutationKey,
} from '@/lib/queries/user-detail';
import { queryKeys } from '@/lib/query-keys';
import {
  diffRoleAssignments,
  roleAssignmentKey,
  type RoleAssignmentRef,
} from '@/lib/role-diff';
import { isAdminAssignment, sortRoles, type RoleView } from '@/lib/roles';
import type { UserDetail, UserPage, UserStatus } from '@/lib/schemas/user';
import { toast } from '@/lib/toast';
import { useNestedDialog } from './invite-dialog-behaviour';
import { RoleMatrix, parseRoleKey, roleKey } from './role-matrix';

/** Without roles a never-activated user's invite cannot be accepted (ROLE-05-2), so the warning differs. */
const INVITEE_STATUSES = new Set<UserStatus>([
  'INVITED',
  'INVITE_EXPIRED',
  'REVOKED',
]);
/** D45 refusals and lost races: the card is stale, so the dialog closes and the card refetches. */
const STATE_ERRORS = {
  LAST_ADMIN: 'errors.lastAdmin',
  SELF_ADMIN_REMOVAL: 'errors.selfAdmin',
} as const;

type InlineError = 'rolesInvalid' | 'unchanged';
type Assignment = RoleAssignmentRef & RoleView;

const usersKey = ['settings', 'users'] as const;
const withUserRoles = (
  data: InfiniteData<UserPage> | undefined,
  id: string,
  roles: UserDetail['roles'],
) =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((user) =>
        user.id === id ? { ...user, roles } : user,
      ),
    })),
  };

function Chips({ roles }: { roles: readonly Assignment[] }) {
  const roleLabel = useRoleLabel();
  const tMatrix = useTranslations('settings.users.roleMatrix');
  return (
    <ul className="flex flex-wrap gap-1">
      {roles.map((assignment) => (
        <li
          key={roleAssignmentKey(assignment)}
          className="bg-primary-subtle text-link max-w-full rounded-full px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere]"
        >
          {roleLabel(
            assignment.role,
            assignment.vertical?.name ??
              (assignment.verticalId ? null : tMatrix('allVerticals')),
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * «Змінити ролі» (STORY-ROLE-01-1/01-2, wireframe §1.4): prefilled matrix, live «Буде додано/знято»,
 * removals confirmed first. Chips in the card update optimistically and roll back on any error.
 */
export function EditRolesDialog({
  detail,
  isSelf,
  canListVerticals,
  onClose,
  onFocusHeading,
  onFocusTrigger,
}: {
  detail: UserDetail;
  isSelf: boolean;
  canListVerticals: boolean;
  onClose: () => void;
  onFocusHeading: () => void;
  onFocusTrigger: () => void;
}) {
  const t = useTranslations('settings.users.drawer.rolesDialog');
  const tDrawer = useTranslations('settings.users.drawer');
  const tMatrix = useTranslations('settings.users.roleMatrix');
  const tCommon = useTranslations('settings.common');
  const tClose = useTranslations('common');
  const queryClient = useQueryClient();
  const refresh = useRefreshUserCard(detail.id);
  const verticals = useQuery({
    ...settingsVerticalsQuery(),
    enabled: canListVerticals,
  });
  const errorId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);
  /** The card behind updates optimistically, so the dialog keeps the set and version it opened with. */
  const [initial] = useState<readonly Assignment[]>(() =>
    detail.roles.map((r) => ({
      role: r.role,
      verticalId: r.vertical?.id ?? null,
      vertical: r.vertical,
    })),
  );
  const [version] = useState(detail.version);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initial.map(roleAssignmentKey)),
  );
  const [error, setError] = useState<InlineError | null>(null);
  const [confirming, setConfirming] = useState(false);
  const mutationKey = userRolesMutationKey(detail.id);
  const busy = useIsMutating({ mutationKey }) > 0;

  const close = () => {
    if (busy) return;
    onClose();
  };
  const { focusHeadingRef: dialogFocusRef, contentProps: dialogProps } =
    useNestedDialog({
      busy,
      close,
      onFocusHeading,
      onFocusFallback: onFocusTrigger,
    });
  const { focusHeadingRef: confirmFocusRef, contentProps: confirmProps } =
    useNestedDialog({
      busy,
      close: () => setConfirming(false),
      onFocusHeading,
    });

  const names = new Map<string, string>();
  for (const v of [
    ...initial.flatMap((r) => (r.vertical ? [r.vertical] : [])),
    ...(verticals.data?.items ?? []),
  ])
    names.set(v.id, v.name);
  const next: Assignment[] = sortRoles(
    [...selected].map((key) => {
      const { role, verticalId } = parseRoleKey(key);
      const name = verticalId ? names.get(verticalId) : undefined;
      return {
        role,
        verticalId,
        vertical: verticalId && name ? { id: verticalId, name } : null,
      };
    }),
  );
  const { added, removed } = diffRoleAssignments(initial, next);
  const changed = added.length > 0 || removed.length > 0;
  const holdsAdmin = initial.some(isAdminAssignment);
  const adminLock = !holdsAdmin
    ? null
    : isSelf
      ? tMatrix('selfAdminLocked')
      : detail.lastActiveAdmin
        ? tMatrix('lastAdminLocked')
        : null;
  const locked = new Map<string, string>(
    adminLock ? [[roleKey('ADMIN', null), adminLock] as const] : [],
  );

  const detailKey = queryKeys.settingsUser(detail.id);
  const finish = () => {
    dialogFocusRef.current = true;
    confirmFocusRef.current = true;
    setConfirming(false);
    onClose();
  };
  const save = useMutation({
    mutationKey,
    mutationFn: (roles: readonly Assignment[]) =>
      updateUserRolesRequest(
        detail.id,
        roles.map(({ role, verticalId }) => ({ role, verticalId })),
        version,
      ),
    onMutate: async (roles) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey, exact: true }),
        queryClient.cancelQueries({ queryKey: usersKey }),
      ]);
      const previous = queryClient.getQueryData<UserDetail>(detailKey);
      const lists = queryClient
        .getQueriesData<InfiniteData<UserPage>>({ queryKey: usersKey })
        .map(([key, data]) => ({
          key,
          roles: data?.pages
            .flatMap((page) => page.items)
            .find((user) => user.id === detail.id)?.roles,
        }));
      const nextRoles = roles.map(({ role, vertical }) => ({ role, vertical }));
      if (previous)
        queryClient.setQueryData<UserDetail>(detailKey, {
          ...previous,
          roles: nextRoles,
        });
      queryClient.setQueriesData<InfiniteData<UserPage>>(
        { queryKey: usersKey },
        (data) => withUserRoles(data, detail.id, nextRoles),
      );
      return { previous, lists };
    },
    onSuccess: () => {
      toast.success(t('toast'));
      finish();
    },
    onError: (failure, _roles, context) => {
      if (context?.previous)
        queryClient.setQueryData(detailKey, context.previous);
      for (const snapshot of context?.lists ?? []) {
        const roles = snapshot.roles;
        if (roles)
          queryClient.setQueryData<InfiniteData<UserPage>>(
            snapshot.key,
            (data) => withUserRoles(data, detail.id, roles),
          );
      }
      setConfirming(false);
      if (failure instanceof ApiError && failure.status === 400) {
        setError(
          failure.code === 'ROLES_UNCHANGED' ? 'unchanged' : 'rolesInvalid',
        );
        return;
      }
      if (
        failure instanceof ApiError &&
        (failure.status === 409 || failure.status === 404)
      ) {
        toast.error(
          Object.hasOwn(STATE_ERRORS, failure.code)
            ? t(STATE_ERRORS[failure.code as keyof typeof STATE_ERRORS])
            : tCommon('conflict'),
        );
        finish();
        return;
      }
      toast.error(tCommon('saveFailed'));
    },
    onSettled: () =>
      Promise.all([
        refresh(),
        isSelf && queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
      ]),
  });
  const pending = save.isPending;

  const toggle = (key: string, on: boolean) => {
    setSelected((current) => {
      const updated = new Set(current);
      if (on) updated.add(key);
      else updated.delete(key);
      return updated;
    });
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !changed) return;
    if (removed.length > 0) return setConfirming(true);
    save.mutate(next);
  };

  const invitee = INVITEE_STATUSES.has(detail.status);
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          closeLabel={tClose('close')}
          className="md:w-[min(44rem,calc(100vw-2rem))]"
          {...dialogProps}
        >
          <DialogTitle className="[overflow-wrap:anywhere]">
            {t('title', { name: detail.fullName })}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <fieldset
              disabled={pending}
              className="flex min-w-0 flex-col gap-2"
              aria-describedby={error ? errorId : undefined}
            >
              <legend className="sr-only">{tDrawer('rolesTitle')}</legend>
              <RoleMatrix
                verticals={verticals.data?.items ?? []}
                verticalsState={
                  verticals.data
                    ? 'success'
                    : verticals.isError || !canListVerticals
                      ? 'error'
                      : 'pending'
                }
                onRetryVerticals={() => void verticals.refetch()}
                canManageVerticals={canListVerticals}
                selected={selected}
                onToggle={toggle}
                invalid={error !== null}
                locked={locked}
              />
              {error && (
                <p
                  id={errorId}
                  role="alert"
                  className="text-error-text text-sm"
                >
                  {t(`errors.${error}`)}
                </p>
              )}
            </fieldset>
            <div aria-live="polite" className="flex flex-col gap-2 text-sm">
              {!changed && (
                <p className="text-muted-foreground">{t('noChanges')}</p>
              )}
              {added.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-foreground font-medium">
                    {t('added')}
                  </span>
                  <Chips roles={added} />
                </div>
              )}
              {removed.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-foreground font-medium">
                    {t('removed')}
                  </span>
                  <Chips roles={removed} />
                </div>
              )}
              {changed && selected.size === 0 && (
                <p className="text-warning-text flex items-start gap-2">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {invitee ? t('invitedNoRoles') : t('lastRoleWarning')}
                </p>
              )}
            </div>
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
                ref={submitRef}
                type="submit"
                className="h-12 sm:h-10"
                disabled={pending || !changed}
                aria-busy={pending}
              >
                {pending ? tCommon('saving') : t('submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (busy) return;
          confirmFocusRef.current = false;
          setConfirming(open);
        }}
      >
        <AlertDialogContent
          {...confirmProps}
          onCloseAutoFocus={(event) => {
            if (confirmFocusRef.current)
              return confirmProps.onCloseAutoFocus(event);
            event.preventDefault();
            submitRef.current?.focus();
          }}
        >
          <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {t('confirmBody', { name: detail.fullName })}
          </AlertDialogDescription>
          <Chips roles={removed} />
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={busy}>
                {tCommon('cancel')}
              </Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              aria-busy={pending}
              onClick={() => save.mutate(next)}
            >
              {pending ? tCommon('saving') : t('confirmSubmit')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
