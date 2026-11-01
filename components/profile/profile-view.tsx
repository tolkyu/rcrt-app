'use client';

import { useQuery } from '@tanstack/react-query';
import { UserRoundX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRoleLabels } from '@/components/shell/role-summary';
import { EmptyState } from '@/components/states/empty-state';
import { THEME_ICONS } from '@/components/theme/theme-icon';
import { useTheme } from '@/components/theme/theme-provider';
import { Avatar } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { meQuery } from '@/lib/queries/me';
import { sortRoles } from '@/lib/roles';
import { THEMES } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { LoginHistoryCard } from './login-history-card';
import { ProfileNameForm } from './profile-name-form';
import { SecurityCard } from './security-card';

function AppearanceCard() {
  const t = useTranslations('profile');
  const tTheme = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  return (
    <Card className="lg:col-span-5">
      <CardHeader>
        <CardTitle>{t('appearanceTitle')}</CardTitle>
        <CardDescription>{t('appearanceDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset>
          <legend className="sr-only">{t('appearanceTitle')}</legend>
          <div className="bg-surface-muted grid grid-cols-3 gap-1 rounded-lg p-1">
            {THEMES.map((option) => {
              const Icon = THEME_ICONS[option];
              const checked = theme === option;
              return (
                <label
                  key={option}
                  className={cn(
                    'has-focus-visible:outline-ring flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-sm font-medium transition-colors duration-120 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 md:min-h-9',
                    checked
                      ? 'border-border bg-surface text-link border shadow-sm'
                      : 'text-muted-foreground-strong hover:text-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option}
                    checked={checked}
                    onChange={() => setTheme(option)}
                    className="sr-only"
                  />
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tTheme(option)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function ProfileView() {
  const t = useTranslations('profile');
  const { label } = useRoleLabels();
  const { data: me } = useQuery(meQuery());
  if (!me) return null;
  const roles = sortRoles(me.roles);
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="lg:col-span-7">
        <CardHeader>
          <CardTitle>{t('personalTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={me.user.fullName} className="size-16 text-xl" />
            <div className="min-w-0">
              <p className="text-foreground truncate text-base font-semibold">
                {me.user.fullName}
              </p>
              <p className="text-muted-foreground text-sm break-all">
                {me.user.email}
              </p>
            </div>
          </div>
          <ProfileNameForm key={me.user.fullName} fullName={me.user.fullName} />
          <div className="flex flex-col gap-1">
            <span className="text-foreground text-sm font-medium">
              {t('emailLabel')}
            </span>
            <p className="bg-surface-muted text-foreground rounded-lg px-3 py-2.5 text-sm break-all">
              {me.user.email}
            </p>
            <p className="text-muted-foreground text-xs">{t('emailHint')}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="lg:col-span-5">
        <CardHeader>
          <CardTitle>{t('accessTitle')}</CardTitle>
          <CardDescription>{t('accessDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <EmptyState icon={UserRoundX} title={t('accessEmpty')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {roles.map((role) => (
                <li
                  key={`${role.role}:${role.vertical?.id ?? 'all'}`}
                  className="border-border flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <span className="text-foreground min-w-0 text-sm font-medium">
                    {label({ role: role.role, vertical: null })}
                  </span>
                  <span className="bg-surface-muted text-muted-foreground-strong shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {role.vertical?.name ?? t('allVerticals')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SecurityCard />
      <AppearanceCard />
      <LoginHistoryCard />
    </div>
  );
}
