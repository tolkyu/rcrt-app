'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api-client';
import { userDetailQuery, userEventsQuery } from '@/lib/queries/user-detail';
import type { UserDetail, UserEvent, UserListItem } from '@/lib/schemas/user';
import { GLOBAL_VERTICAL } from '@/lib/user-constants';
import { cn } from '@/lib/utils';
import { useAuditLabels } from './audit-labels';
import { UserInviteActions } from './user-invite-actions';
import { MfaStatus, StatusChip } from './user-status';

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

function RolesSection({ head }: { head: Head }) {
  const t = useTranslations('settings.users.drawer');
  const roleLabel = useRoleLabel();
  const inactive = head.status === 'DEACTIVATED';
  return (
    <Section title={t('rolesTitle')}>
      {head.roles.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noRoles')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {head.roles.map((assignment) => (
            <li
              key={`${assignment.role}:${assignment.vertical?.id ?? GLOBAL_VERTICAL}`}
              className={cn(
                'max-w-full rounded-full px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere]',
                inactive
                  ? 'bg-surface-muted text-muted-foreground'
                  : 'bg-primary-subtle text-link',
              )}
            >
              {roleLabel(assignment.role, assignment.vertical?.name ?? null)}
            </li>
          ))}
        </ul>
      )}
      {inactive && head.roles.length > 0 && (
        <p className="text-muted-foreground text-xs">{t('rolesInactive')}</p>
      )}
    </Section>
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
              <li key={vertical.id}>
                {priority === null
                  ? t('priorityNotSet', { vertical: vertical.name })
                  : t('priorityValue', { vertical: vertical.name, priority })}
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
            {detail.status !== 'REVOKED' && (
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

function useEventDetails() {
  const t = useTranslations('settings.users.drawer');
  const labels = useAuditLabels();
  const roleLabel = useRoleLabel();
  return (event: UserEvent) => {
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
        fields: event.fields.map(labels.field).join(', '),
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

/** «Картка користувача» (STORY-ROLE-05-4 AC2, wireframe §1.3): header from the list cache, details stream in; invite actions in the footer (ROLE-05-3). */
export function UserDrawer({
  userId,
  cached,
  currentUserId,
  canReadAudit,
  onClose,
  onRestoreFocus,
}: {
  userId: string;
  cached: UserListItem | undefined;
  currentUserId: string;
  canReadAudit: boolean;
  onClose: () => void;
  /** Radix returns focus only to a Dialog.Trigger; the list knows which row opened the drawer. */
  onRestoreFocus: () => void;
}) {
  const t = useTranslations('settings.users.drawer');
  const tUsers = useTranslations('settings.users');
  const [tab, setTab] = useState('profile');
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useQuery(userDetailQuery(userId));
  const head: Head | undefined = detail.data ?? cached;
  const notFound =
    detail.error instanceof ApiError && detail.error.status === 404;

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
        <div className="flex items-start gap-3 pr-10">
          <Avatar name={head.fullName} className="size-12 text-base" />
          <div className="flex min-w-0 flex-col gap-1">
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
              {head.email}
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
                className="text-link self-start text-sm hover:underline"
              >
                {t('auditLink')}
              </Link>
            )}
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label={t('tabsLabel')}>
            <TabsTrigger value="profile">{t('tabProfile')}</TabsTrigger>
            <TabsTrigger value="history">{t('tabHistory')}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="flex flex-col gap-6">
            <RolesSection head={head} />
            {detail.data ? (
              <DetailSections detail={detail.data} />
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
