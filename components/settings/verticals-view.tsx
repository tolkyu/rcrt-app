'use client';

import { useQuery } from '@tanstack/react-query';
import { History, Info, Layers, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { settingsVerticalsQuery } from '@/lib/queries/settings';
import type { SettingsVertical } from '@/lib/schemas/vertical';
const VerticalNameDialog = dynamic(() =>
  import('./vertical-name-dialog').then((module) => module.VerticalNameDialog),
);

type DialogState = { target: SettingsVertical | null } | null;

export function VerticalsView({
  canReadAudit,
  canManageUsers,
}: {
  canReadAudit: boolean;
  canManageUsers: boolean;
}) {
  const t = useTranslations('settings.verticals');
  const { data, isError, isFetching, refetch } = useQuery(
    settingsVerticalsQuery(),
  );
  const [dialog, setDialog] = useState<DialogState>(null);
  const openCreate = () => setDialog({ target: null });
  /** The count is users with status «Активний», so the link opens exactly that subset (wireframe §2.1). */
  const usersCount = (vertical: SettingsVertical) => {
    const label = t('usersCount', { count: vertical.usersCount });
    return canManageUsers && vertical.usersCount > 0 ? (
      <Link
        href={`/settings/users?status=ACTIVE&vertical=${vertical.id}`}
        className="text-link hover:underline"
      >
        {label}
      </Link>
    ) : (
      label
    );
  };
  const actions = (vertical: SettingsVertical) => (
    <div className="flex items-center justify-end gap-1">
      <RenameButton
        vertical={vertical}
        label={t('rename')}
        onClick={() => setDialog({ target: vertical })}
      />
      {canReadAudit && (
        <Button asChild variant="ghost" size="sm" className="h-11 md:h-8">
          <Link
            href={`/settings/audit?entityType=vertical&entityId=${vertical.id}&period=365d`}
            aria-label={`${t('history')}: ${vertical.name}`}
          >
            <History aria-hidden="true" />
            <span className="hidden lg:inline">{t('history')}</span>
          </Link>
        </Button>
      )}
    </div>
  );
  const items = data?.items ?? [];

  const createButton = (
    <Button onClick={openCreate} className="h-11 md:h-10">
      <Plus aria-hidden="true" />
      {t('create')}
    </Button>
  );

  let body;
  if (!data) {
    body = isError ? (
      <SectionError onRetry={() => void refetch()} retrying={isFetching} />
    ) : (
      <div className="skeleton-delayed flex flex-col gap-2 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={Layers}
        title={t('empty.title')}
        description={t('empty.description')}
        action={createButton}
      />
    );
  } else {
    body = (
      <>
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left text-xs font-medium">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('columns.name')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('columns.users')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('columns.createdAt')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{t('columns.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((vertical) => (
              <tr
                key={vertical.id}
                className="border-border h-12 border-b last:border-0"
              >
                <th
                  scope="row"
                  className="text-foreground px-4 text-left font-semibold"
                >
                  {vertical.name}
                </th>
                <td className="text-muted-foreground min-w-40 px-4 whitespace-nowrap">
                  {usersCount(vertical)}
                </td>
                <td className="text-muted-foreground px-4 tabular-nums">
                  {t('createdDate', { at: new Date(vertical.createdAt) })}
                </td>
                <td className="px-4 text-right">{actions(vertical)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-border divide-y md:hidden">
          {items.map((vertical) => (
            <li
              key={vertical.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-foreground text-base font-semibold break-words">
                  {vertical.name}
                </p>
                <p className="text-muted-foreground text-sm">
                  {usersCount(vertical)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('createdOn', { at: new Date(vertical.createdAt) })}
                </p>
              </div>
              {actions(vertical)}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={items.length > 0 ? createButton : undefined}
      />
      <Card className="overflow-hidden p-0">{body}</Card>
      <p className="text-muted-foreground mt-4 flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t('permanentNote')}
      </p>
      {dialog && (
        <VerticalNameDialog
          key={dialog.target?.id ?? 'new'}
          target={dialog.target}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function RenameButton({
  vertical,
  label,
  onClick,
}: {
  vertical: SettingsVertical;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={`${label}: ${vertical.name}`}
      className="h-11 md:h-8"
    >
      <Pencil aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
