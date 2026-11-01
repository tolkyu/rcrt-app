'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { meQuery } from '@/lib/queries/me';
import { useRoleLabels } from './role-summary';
import { useLogout } from './use-logout';

/** Avatar + name + «роль · вертикаль» (D64); reads the hydrated `me` query so a name edit shows at once. */
export function UserMenu() {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const { data: me } = useQuery(meQuery());
  const { summary } = useRoleLabels();
  const logout = useLogout();
  if (!me)
    return <Skeleton className="skeleton-delayed size-9 rounded-full" />;
  const roleText = summary(me.roles);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('userMenu')}
        className="hover:bg-surface-muted flex min-h-11 items-center gap-3 rounded-lg px-1 text-left md:px-2"
      >
        <Avatar name={me.user.fullName} />
        <span className="hidden max-w-56 min-w-0 flex-col md:flex">
          <span className="text-foreground truncate text-sm font-semibold">
            {me.user.fullName}
          </span>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-foreground truncate text-sm font-semibold">
            {me.user.fullName}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {me.user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden="true" />
            {tNav('profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={logout.isPending}
          onSelect={(event) => {
            event.preventDefault();
            logout.mutate();
          }}
        >
          <LogOut aria-hidden="true" />
          {logout.isPending ? t('loggingOut') : t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
