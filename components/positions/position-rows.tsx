'use client';

import { Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { PositionGroup } from '@/lib/position-list';
import type { Position } from '@/lib/schemas/position';
import { cn } from '@/lib/utils';
import { PositionStatusChip } from './position-status-chip';

export interface PositionRowHandlers {
  readonly pendingIds: ReadonlySet<string>;
  readonly onRename: (position: Position) => void;
  readonly onToggle: (position: Position) => void;
  readonly onAdd: (verticalId: string) => void;
  readonly canCreate: boolean;
}

interface ListProps {
  readonly groups: readonly PositionGroup[];
  readonly grouped: boolean;
  readonly handlers: PositionRowHandlers;
}

function PositionActions({
  position,
  layout,
  handlers,
}: {
  position: Position;
  layout: 'row' | 'card';
  handlers: PositionRowHandlers;
}) {
  const t = useTranslations('positions');
  const busy = handlers.pendingIds.has(position.id);
  const card = layout === 'card';
  const buttonClass = card
    ? 'h-auto min-h-11 flex-1 py-2 whitespace-normal'
    : 'h-8';
  const labelClass = card ? undefined : 'hidden lg:inline';
  const common = {
    variant: card ? ('outline' as const) : ('ghost' as const),
    size: 'sm' as const,
    className: buttonClass,
    disabled: busy,
    'aria-busy': busy || undefined,
  };
  return (
    <div
      className={
        card ? 'mt-3 flex gap-2' : 'flex items-center justify-end gap-1'
      }
    >
      <Button
        {...common}
        aria-label={t('renameLabel', { name: position.name })}
        data-focus-key={`rename:${position.id}`}
        onClick={() => handlers.onRename(position)}
      >
        <Pencil aria-hidden="true" />
        <span className={labelClass}>{t('rename')}</span>
      </Button>
      <Button
        {...common}
        aria-label={t(
          position.isActive ? 'deactivateLabel' : 'reactivateLabel',
          { name: position.name },
        )}
        data-focus-key={`toggle:${position.id}`}
        onClick={() => handlers.onToggle(position)}
      >
        {position.isActive ? (
          <PowerOff aria-hidden="true" />
        ) : (
          <Power aria-hidden="true" />
        )}
        <span className={labelClass}>
          {t(position.isActive ? 'deactivate' : 'reactivate')}
        </span>
      </Button>
    </div>
  );
}

function GroupTitle({
  group,
  className,
}: {
  group: PositionGroup;
  className?: string;
}) {
  const t = useTranslations('positions');
  return (
    <h2 className={cn('text-sm font-semibold', className)}>
      {t('groupTitle', {
        vertical: group.vertical.name,
        count: group.items.length,
      })}
    </h2>
  );
}

function GroupEmpty({
  group,
  handlers,
}: {
  group: PositionGroup;
  handlers: PositionRowHandlers;
}) {
  const t = useTranslations('positions');
  if (group.total > 0)
    return (
      <span className="text-muted-foreground text-sm">
        {t('emptyActive.title')}
      </span>
    );
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
      {t('groupEmpty')}
      {handlers.canCreate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-11 md:h-8"
          aria-label={t('groupAddLabel', { vertical: group.vertical.name })}
          data-focus-key={`add:${group.vertical.id}`}
          onClick={() => handlers.onAdd(group.vertical.id)}
        >
          <Plus aria-hidden="true" />
          {t('groupAdd')}
        </Button>
      )}
    </span>
  );
}

const cell = 'px-4 py-2 align-middle';

export function PositionTable({ groups, grouped, handlers }: ListProps) {
  const t = useTranslations('positions');
  return (
    <table className="hidden w-full text-sm md:table">
      <thead>
        <tr className="border-border text-muted-foreground border-b text-left text-xs">
          <th scope="col" className="px-4 py-3 font-medium">
            {t('columns.name')}
          </th>
          <th scope="col" className="px-4 py-3 font-medium">
            {t('columns.status')}
          </th>
          <th scope="col" className="px-4 py-3 font-medium">
            {t('columns.openVacancies')}
          </th>
          <th scope="col" className="px-4 py-3 font-medium">
            {t('columns.createdAt')}
          </th>
          <th scope="col" className="px-4 py-3 text-right font-medium">
            <span className="sr-only">{t('columns.actions')}</span>
          </th>
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.vertical.id}>
          {grouped && (
            <tr className="border-border bg-surface-muted border-b">
              <td colSpan={5} className="px-4 py-2">
                <GroupTitle group={group} />
              </td>
            </tr>
          )}
          {grouped && group.items.length === 0 && (
            <tr className="border-border border-b">
              <td colSpan={5} className="px-4 py-3">
                <GroupEmpty group={group} handlers={handlers} />
              </td>
            </tr>
          )}
          {group.items.map((position) => (
            <tr
              key={position.id}
              className="border-border h-12 border-b last:border-0"
            >
              <th
                scope="row"
                tabIndex={-1}
                data-focus-key={`name:${position.id}`}
                className={cn(
                  cell,
                  'text-left font-semibold [overflow-wrap:anywhere]',
                  position.isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground-strong',
                )}
              >
                {position.name}
              </th>
              <td className={cell}>
                <PositionStatusChip active={position.isActive} />
              </td>
              <td className={cn(cell, 'text-muted-foreground tabular-nums')}>
                {position.openVacanciesCount ?? t('openVacanciesUnknown')}
              </td>
              <td className={cn(cell, 'text-muted-foreground tabular-nums')}>
                {t('createdDate', { at: new Date(position.createdAt) })}
              </td>
              <td className={cell}>
                <PositionActions
                  position={position}
                  layout="row"
                  handlers={handlers}
                />
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

export function PositionCards({ groups, grouped, handlers }: ListProps) {
  const t = useTranslations('positions');
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {groups.map((group) => (
        <div key={group.vertical.id} className="flex flex-col gap-2">
          {grouped && (
            <GroupTitle
              group={group}
              className="bg-background sticky top-14 z-10 py-2"
            />
          )}
          {grouped && group.items.length === 0 && (
            <div className="border-border bg-surface rounded-2xl border p-4">
              <GroupEmpty group={group} handlers={handlers} />
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {group.items.map((position) => (
              <li
                key={position.id}
                className="border-border bg-surface rounded-2xl border p-4"
              >
                <p
                  tabIndex={-1}
                  data-focus-key={`name:${position.id}`}
                  className={cn(
                    'text-base font-semibold [overflow-wrap:anywhere]',
                    position.isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground-strong',
                  )}
                >
                  {position.name}
                </p>
                <div className="mt-2">
                  <PositionStatusChip active={position.isActive} />
                </div>
                <p className="text-muted-foreground mt-2 text-sm tabular-nums">
                  {t('openVacanciesLine', {
                    count:
                      position.openVacanciesCount ?? t('openVacanciesUnknown'),
                  })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('createdOn', { at: new Date(position.createdAt) })}
                </p>
                <PositionActions
                  position={position}
                  layout="card"
                  handlers={handlers}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
