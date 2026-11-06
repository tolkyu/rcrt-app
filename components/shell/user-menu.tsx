'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lazy, type ComponentProps } from 'react';
import { Avatar, initials } from '@/components/ui/avatar';
import { DeferredMenu, useDeferredMenu } from '@/components/ui/deferred-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { meQuery } from '@/lib/queries/me';
import { useRoleLabels } from './role-summary';

const loadMenu = () => import('./user-menu-dropdown');
const UserMenuDropdown = lazy(loadMenu);

/** Avatar + name + «роль · вертикаль» (D64); reads the hydrated `me` query so a name edit shows at once. */
export function UserMenu() {
  const t = useTranslations('shell');
  const { data: me } = useQuery(meQuery());
  const { summary } = useRoleLabels();
  const menu = useDeferredMenu(loadMenu);
  if (!me) return <Skeleton className="skeleton-delayed size-9 rounded-full" />;
  const roleText = summary(me.roles);
  const trigger = (props: ComponentProps<'button'>) => (
    <button
      type="button"
      aria-label={t('userMenuFor', {
        initials: initials(me.user.fullName),
        name: me.user.fullName,
        roles: roleText,
      })}
      className="hover:bg-surface-muted flex min-h-11 items-center gap-3 rounded-lg px-1 text-left md:px-2"
      {...props}
    >
      <Avatar name={me.user.fullName} />{' '}
      <span className="hidden max-w-56 min-w-0 flex-col md:flex">
        <span className="text-foreground truncate text-sm font-semibold">
          {me.user.fullName}
        </span>{' '}
        {roleText && (
          <span className="text-muted-foreground truncate text-xs">
            {roleText}
          </span>
        )}
      </span>
      <ChevronDown
        className="text-muted-foreground hidden size-4 md:block"
        aria-hidden="true"
      />
    </button>
  );
  return (
    <DeferredMenu menu={menu} trigger={trigger}>
      {(openedBy, menuTrigger) => (
        <UserMenuDropdown
          trigger={menuTrigger}
          openedBy={openedBy}
          user={me.user}
        />
      )}
    </DeferredMenu>
  );
}
