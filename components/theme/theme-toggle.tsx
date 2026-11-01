'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { useDeferredMenu } from '@/components/ui/deferred-menu';
import { THEME_ICONS } from './theme-icon';
import { useTheme } from './theme-provider';

const loadMenu = () => import('./theme-menu');
const ThemeMenu = lazy(loadMenu);

/** Top-bar shortcut to the same setting as «Профіль → Тема оформлення» (A-34). */
export function ThemeToggle() {
  const t = useTranslations('theme');
  const { theme } = useTheme();
  const { active, triggerProps } = useDeferredMenu(loadMenu);
  const Icon = THEME_ICONS[theme];
  const trigger = (props: ComponentProps<typeof Button>) => (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('current', { theme: t(theme) })}
      {...props}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
  if (!active) return trigger(triggerProps);
  return (
    <Suspense fallback={trigger(triggerProps)}>
      <ThemeMenu trigger={trigger({})} />
    </Suspense>
  );
}
