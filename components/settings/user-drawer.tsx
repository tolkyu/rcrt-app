'use client';

import {
  useInfiniteQuery,
  useIsMutating,
  useQuery,
} from '@tanstack/react-query';
import { MoreHorizontal, SearchX } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmailText } from '@/components/ui/email-text';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api-client';
import {
  userCardMutationKey,
  userDetailQuery,
  userEventsQuery,
} from '@/lib/queries/user-detail';
import type {
  UserDetail,
  UserEvent,
  UserListItem,
  UserStatus,
} from '@/lib/schemas/user';
import { useAuditLabels } from './audit-labels';
import { useAuditFieldLabel } from './audit-field-label';
import { UserInviteActions } from './user-invite-actions';
import { UserActivationActions } from './user-activation-actions';
import { RoleChips } from './role-chips';
import { MfaStatus, StatusChip } from './user-status';

const loadChangeEmailDialog = () => import('./change-email-dialog');
const ChangeEmailDialog = dynamic(() =>
  loadChangeEmailDialog().then((module) => module.ChangeEmailDialog),
);
const preloadChangeEmailDialog = () => {
  loadChangeEmailDialog().catch(() => undefined);
};
const loadEditRolesDialog = () => import('./edit-roles-dialog');
const EditRolesDialog = dynamic(() =>
  loadEditRolesDialog().then((module) => module.EditRolesDialog),
);
const preloadEditRolesDialog = () => {
  loadEditRolesDialog().catch(() => undefined);
};
const ResetMfaDialog = dynamic(() =>
  import('./reset-mfa-dialog').then((module) => module.ResetMfaDialog),
);
/** Email can change only before activation (D69); activated users get it in Phase 5. */
const EMAIL_EDITABLE = new Set<UserStatus>([
  'INVITED',
  'INVITE_EXPIRED',
  'REVOKED',
]);

type Head = Pick<
  UserListItem,
  'fullName' | 'email' | 'status' | 'lastLoginAt' | 'roles'
>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function SectionSkeleton() {
  return (
    <div className="skeleton-delayed flex flex-col gap-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function RolesSection({ head, action }: { head: Head; action?: ReactNode }) {
  const t = useTranslations('settings.users.drawer');
  const inactive = head.status === 'DEACTIVATED';
  return (
    <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <h3 className="text-foreground text-sm font-semibold">
        {t('rolesTitle')}
      </h3>
      <div className="col-span-2 flex flex-col gap-2">
        {head.roles.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noRoles')}</p>
        ) : (
          <RoleChips roles={head.roles} tone={inactive ? 'muted' : 'active'} />
        )}
        {inactive && head.roles.length > 0 && (
          <p className="text-muted-foreground text-xs">{t('rolesInactive')}</p>
        )}
      </div>
      {action && (
        // Mobile: below the chips; desktop: beside the heading (wireframe §1.3, §1.9).
        <div className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1">
          {action}
        </div>
      )}
    </section>
  );
}

/** «Змінити ролі» (wireframe §1.3): deactivated users keep their roles frozen until «Активувати знову» (ROLE-05-5). */
function EditRoles({
  detail,
  isSelf,
  canListVerticals,
  onFocusHeading,
}: {
  detail: UserDetail;
  isSelf: boolean;
  canListVerticals: boolean;
  onFocusHeading: () => void;
}) {
  const t = useTranslations('settings.users.drawer');
  const trigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const busy =
    useIsMutating({ mutationKey: userCardMutationKey(detail.id) }) > 0;
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="h-11 md:h-9"
        onPointerEnter={preloadEditRolesDialog}
        onFocus={preloadEditRolesDialog}
        onClick={() => setEditing(true)}
        disabled={busy}
      >
        {t('editRoles')}
      </Button>
      {editing && (
        <EditRolesDialog
          detail={detail}
          isSelf={isSelf}
          canListVerticals={canListVerticals}
          onClose={() => setEditing(false)}
          onFocusHeading={onFocusHeading}
          onFocusTrigger={() => trigger.current?.focus()}
        />
      )}
    </>
  );
}

function DetailSections({ detail }: { detail: UserDetail }) {
  const t = useTranslations('settings.users.drawer');
  const tUsers = useTranslations('settings.users');
  const invitation = detail.invitation;
  const revokedBy = invitation?.revokedBy;
  const revokedByName = revokedBy
    ? revokedBy.isActive
      ? revokedBy.fullName
      : `${revokedBy.fullName} ${tUsers('deactivatedSuffix')}`
    : null;
  return (
    <>
      {detail.teamLeadPriorities.length > 0 && (
        <Section title={t('priorityTitle')}>
          <ul className="text-foreground flex flex-col gap-1 text-sm">
            {detail.teamLeadPriorities.map(({ vertical, priority }) => (
              <li
                key={vertical.id}
                className="flex flex-wrap items-center gap-x-3"
              >
                <span>
                  {priority === null
                    ? t('priorityNotSet', { vertical: vertical.name })
                    : t('priorityValue', { vertical: vertical.name, priority })}
                </span>
                {detail.status === 'ACTIVE' && (
                  <Link
                    href={`/settings/priorities?vertical=${vertical.id}`}
                    className="text-link inline-flex min-h-11 items-center hover:underline md:min-h-0"
                    aria-label={t('priorityEditLabel', {
                      vertical: vertical.name,
                    })}
                  >
                    {t('priorityEdit')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {invitation && (
        <Section title={t('inviteTitle')}>
          <ul className="text-foreground flex flex-col gap-1 text-sm tabular-nums">
            <li>{t('inviteSent', { at: new Date(invitation.sentAt) })}</li>
            {detail.status === 'INVITED' && (
              <li>
                {t('inviteExpires', { at: new Date(invitation.expiresAt) })}
              </li>
            )}
            {detail.status === 'INVITE_EXPIRED' && (
              <li className="text-warning-text">
                {t('inviteExpired', { at: new Date(invitation.expiresAt) })}
              </li>
            )}
            {detail.status === 'REVOKED' && invitation.revokedAt && (
              <li>
                {revokedByName
                  ? t('inviteRevoked', {
                      at: new Date(invitation.revokedAt),
                      name: revokedByName,
                    })
                  : t('inviteRevokedAt', {
                      at: new Date(invitation.revokedAt),
                    })}
              </li>
            )}
            {detail.status !== 'REVOKED' && invitation.resendCount > 0 && (
              <li className="text-muted-foreground">
                {t('inviteResentCount', { count: invitation.resendCount })}
              </li>
            )}
          </ul>
        </Section>
      )}
      {detail.status === 'ACTIVE' && (
        <Section title={t('securityTitle')}>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-foreground">{t('mfaLabel')}</span>
            <MfaStatus mfa={detail.mfa} />
            <span className="text-muted-foreground text-xs">
              {detail.mfaRequired ? t('mfaRequiredRole') : t('mfaOptionalRole')}
            </span>
          </div>
        </Section>
      )}
    </>
  );
}

function ResetMfa({
  detail,
  isSelf,
  onFocusHeading,
}: {
  detail: UserDetail;
  isSelf: boolean;
  onFocusHeading: () => void;
}) {
  const t = useTranslations('settings.users.drawer.resetMfa');
  const reasonId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const busy =
    useIsMutating({ mutationKey: userCardMutationKey(detail.id) }) > 0;
  if (detail.status !== 'ACTIVE') return null;
  const reason = isSelf
    ? t('selfReason')
    : detail.mfa.factors === 0
      ? t('noFactors')
      : null;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        ref={trigger}
        variant="outline"
        className="h-11"
        aria-disabled={Boolean(reason) || undefined}
        aria-describedby={reason ? reasonId : undefined}
        disabled={busy}
        onClick={() => !reason && setOpen(true)}
      >
        {t('submit')}
      </Button>
      {reason && (
        <p id={reasonId} className="text-muted-foreground text-xs">
          {reason}
        </p>
      )}
      {open && (
        <ResetMfaDialog
          detail={detail}
          onClose={() => setOpen(false)}
          onFocusHeading={onFocusHeading}
          onFocusTrigger={() => trigger.current?.focus()}
        />
      )}
    </div>
  );
}

function useEventDetails() {
  const t = useTranslations('settings.users.drawer');
  const tPriority = useTranslations('settings.priorities');
  const labels = useAuditLabels();
  const fieldLabel = useAuditFieldLabel();
  const roleLabel = useRoleLabel();
  return (event: UserEvent) => {
    if (event.priorityChange) {
      const change = event.priorityChange;
      const value = (priority: number | null) =>
        priority === null
          ? tPriority('valueNone')
          : tPriority('valueShort', { priority });
      return t('historyPriority', {
        vertical:
          change.vertical.name ??
          t('unknownVertical', { id: labels.shortId(change.vertical.id) }),
        from: value(change.old),
        to: value(change.new),
      });
    }
    if (event.roles)
      return event.roles
        .map(({ role, vertical }) =>
          roleLabel(
            role,
            vertical
              ? (vertical.name ??
                  t('unknownVertical', { id: labels.shortId(vertical.id) }))
              : null,
          ),
        )
        .join(', ');
    if (event.fields)
      return t('historyFields', {
        fields: event.fields.map(fieldLabel).join(', '),
      });
    return null;
  };
}

/** «Історія»: the user timeline from entity_event (HIST-03); no IP/UA — those live in «Журнал дій». */
function History({ userId }: { userId: string }) {
  const t = useTranslations('settings.users.drawer');
  const tUsers = useTranslations('settings.users');
  const labels = useAuditLabels();
  const details = useEventDetails();
  const query = useInfiniteQuery(userEventsQuery(userId));
  if (!query.data)
    return query.isError ? (
      <SectionError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <div className="skeleton-delayed flex flex-col gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0)
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {t('historyEmpty')}
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      <ol
        aria-label={t('historyTitle')}
        className="border-border ml-1 flex flex-col gap-4 border-l pl-4"
      >
        {items.map((event) => {
          const line = details(event);
          return (
            <li key={event.id} className="relative flex flex-col gap-0.5">
              <span
                aria-hidden="true"
                className="bg-primary absolute top-1.5 -left-[1.3125rem] size-2 rounded-full"
              />
              <span className="text-foreground text-sm font-medium">
                {labels.action(event.type)}
              </span>
              {line && (
                <span className="text-muted-foreground text-sm [overflow-wrap:anywhere]">
                  {line}
                </span>
              )}
              <span className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
                <span>
                  {labels.actor({ ...event, action: event.type, entity: null })}
                </span>
                <time
                  dateTime={event.occurredAt}
                  className="tabular-nums before:mr-1.5 before:content-['·']"
                >
                  {t('historyTime', { at: new Date(event.occurredAt) })}
                </time>
              </span>
            </li>
          );
        })}
      </ol>
      {query.isError && (
        <SectionError
          onRetry={() => void query.fetchNextPage()}
          retrying={query.isFetchingNextPage}
        />
      )}
      {query.hasNextPage && !query.isError && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {tUsers('loadMore')}
        </Button>
      )}
    </div>
  );
}

/** Header «⋯» (wireframe §1.3): only «Змінити email» in Phase 1, so the trigger renders only when that item applies. */
function MoreActions({
  detail,
  anchorRef,
  onFocusHeading,
  onShowUser,
}: {
  detail: UserDetail;
  anchorRef: RefObject<HTMLDivElement | null>;
  onFocusHeading: () => void;
  onShowUser: (email: string) => void;
}) {
  const t = useTranslations('settings.users.drawer');
  const itemId = useId();
  const labelId = `${itemId}-label`;
  const reasonId = `${itemId}-reason`;
  const trigger = useRef<HTMLButtonElement>(null);
  const opening = useRef(false);
  const [changing, setChanging] = useState(false);
  const [offset, setOffset] = useState(6);
  const busy =
    useIsMutating({ mutationKey: userCardMutationKey(detail.id) }) > 0;
  if (!EMAIL_EDITABLE.has(detail.status)) return null;
  const noRoles = detail.roles.length === 0;
  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open && anchorRef.current && trigger.current)
            setOffset(
              Math.max(
                6,
                Math.round(
                  anchorRef.current.getBoundingClientRect().bottom -
                    trigger.current.getBoundingClientRect().bottom,
                ) + 8,
              ),
            );
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 md:size-9"
            aria-label={t('moreActions')}
            disabled={busy}
            onPointerEnter={preloadChangeEmailDialog}
            onFocus={preloadChangeEmailDialog}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          sideOffset={offset}
          className="max-w-72"
          onCloseAutoFocus={() => {
            // The dialog opens only once the menu has returned focus to its trigger (Radix menu→dialog focus fight).
            if (!opening.current) return;
            opening.current = false;
            setChanging(true);
          }}
        >
          <DropdownMenuItem
            aria-disabled={noRoles || undefined}
            aria-labelledby={labelId}
            aria-describedby={noRoles ? reasonId : undefined}
            className="aria-disabled:text-muted-foreground py-2"
            onSelect={(event) => {
              // aria-disabled instead of Radix `disabled`: disabled items are skipped by arrow keys, hiding the reason.
              if (noRoles) return event.preventDefault();
              opening.current = true;
            }}
          >
            <span className="flex flex-col gap-0.5">
              <span id={labelId}>{t('changeEmail.menuItem')}</span>
              {noRoles && (
                <span
                  id={reasonId}
                  className="text-muted-foreground text-xs whitespace-normal"
                >
                  {t('noRolesReason')}
                </span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {changing && (
        <ChangeEmailDialog
          detail={detail}
          onClose={() => setChanging(false)}
          onFocusHeading={onFocusHeading}
          onFocusTrigger={() => trigger.current?.focus()}
          onShowUser={onShowUser}
        />
      )}
    </>
  );
}

/** «Картка користувача» (STORY-ROLE-05-4 AC2, wireframe §1.3): header from the list cache, details stream in; invite actions in the footer (ROLE-05-3). */
export function UserDrawer({
  userId,
  cached,
  currentUserId,
  canReadAudit,
  canListVerticals,
  onClose,
  onRestoreFocus,
  onShowUser,
}: {
  userId: string;
  cached: UserListItem | undefined;
  currentUserId: string;
  canReadAudit: boolean;
  canListVerticals: boolean;
  onClose: () => void;
  /** «Показати в списку» for an address that belongs to someone else: closes the card and searches the list. */
  onShowUser: (email: string) => void;
  /** Radix returns focus only to a Dialog.Trigger; the list knows which row opened the drawer. */
  onRestoreFocus: () => void;
}) {
  const t = useTranslations('settings.users.drawer');
  const tUsers = useTranslations('settings.users');
  const [tab, setTab] = useState('profile');
  const heading = useRef<HTMLHeadingElement>(null);
  const identity = useRef<HTMLDivElement>(null);
  const detail = useQuery(userDetailQuery(userId));
  const head: Head | undefined = detail.data ?? cached;
  const notFound =
    detail.error instanceof ApiError && detail.error.status === 404;
  const content = useRef<HTMLDivElement>(null);
  const loaded = Boolean(head) && !notFound;
  useEffect(() => {
    if (!loaded) return;
    const active = document.activeElement;
    const inside = Boolean(active && content.current?.contains(active));
    // Never pull focus out of a dialog opened over the card.
    if (!inside && active?.closest('[role="dialog"],[role="alertdialog"]'))
      return;
    // A card opened before the user was cached focused the loading heading, which is now replaced.
    if (!inside || active === content.current) heading.current?.focus();
  }, [loaded]);

  let body: ReactNode;
  if (notFound) {
    body = <EmptyState icon={SearchX} title={t('notFound')} />;
  } else if (!head) {
    body = detail.isError ? (
      <SectionError
        onRetry={() => void detail.refetch()}
        retrying={detail.isFetching}
      />
    ) : (
      <SectionSkeleton />
    );
  } else {
    body = (
      <>
        <div ref={identity} className="flex items-start gap-3 pr-10">
          <Avatar name={head.fullName} className="size-12 text-base" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <SheetTitle
              ref={heading}
              tabIndex={-1}
              className="[overflow-wrap:anywhere] focus:outline-none"
            >
              {head.fullName}
              {userId === currentUserId && (
                <span className="text-muted-foreground text-sm font-normal">
                  {' '}
                  {tUsers('you')}
                </span>
              )}
              {head.status === 'DEACTIVATED' && (
                <span className="text-muted-foreground text-sm font-normal">
                  {' '}
                  {tUsers('deactivatedSuffix')}
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="[overflow-wrap:anywhere]">
              <EmailText email={head.email} />
            </SheetDescription>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusChip
                user={{ status: head.status, inviteExpiresAt: null }}
              />
              <span className="text-muted-foreground text-xs tabular-nums">
                {head.lastLoginAt
                  ? t('lastLogin', { at: new Date(head.lastLoginAt) })
                  : tUsers('lastLoginNever')}
              </span>
            </div>
            {canReadAudit && (
              <Link
                href={`/settings/audit?entityType=user&entityId=${userId}&period=365d`}
                className="text-link inline-flex min-h-11 items-center self-start text-sm hover:underline md:min-h-0"
              >
                {t('auditLink')}
              </Link>
            )}
          </div>
          {detail.data && (
            <MoreActions
              detail={detail.data}
              anchorRef={identity}
              onFocusHeading={() => heading.current?.focus()}
              onShowUser={onShowUser}
            />
          )}
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label={t('tabsLabel')}>
            <TabsTrigger value="profile">{t('tabProfile')}</TabsTrigger>
            <TabsTrigger value="history">{t('tabHistory')}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="flex flex-col gap-6">
            <RolesSection
              head={head}
              action={
                detail.data && detail.data.status !== 'DEACTIVATED' ? (
                  <EditRoles
                    detail={detail.data}
                    isSelf={userId === currentUserId}
                    canListVerticals={canListVerticals}
                    onFocusHeading={() => heading.current?.focus()}
                  />
                ) : undefined
              }
            />
            {detail.data ? (
              <>
                <DetailSections detail={detail.data} />
                <ResetMfa
                  detail={detail.data}
                  isSelf={userId === currentUserId}
                  onFocusHeading={() => heading.current?.focus()}
                />
              </>
            ) : detail.isError ? (
              <SectionError
                onRetry={() => void detail.refetch()}
                retrying={detail.isFetching}
              />
            ) : (
              <SectionSkeleton />
            )}
          </TabsContent>
          <TabsContent value="history">
            <History userId={userId} />
          </TabsContent>
        </Tabs>
        {detail.data && (
          <UserActivationActions
            detail={detail.data}
            isSelf={userId === currentUserId}
            onFocusHeading={() => heading.current?.focus()}
          />
        )}
        {detail.data && (
          <UserInviteActions
            detail={detail.data}
            onFocusHeading={() => heading.current?.focus()}
          />
        )}
      </>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        ref={content}
        side="right"
        closeLabel={t('close')}
        className="gap-5 p-6 sm:w-[25rem]"
        onOpenAutoFocus={(event) => {
          if (!heading.current) return;
          event.preventDefault();
          heading.current.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        {!head || notFound ? (
          <>
            <SheetTitle ref={heading} tabIndex={-1} className="pr-10">
              {t('title')}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t('title')}
            </SheetDescription>
          </>
        ) : null}
        {body}
      </SheetContent>
    </Sheet>
  );
}
