'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  menuAutoFocus,
  type MenuOpenedBy,
} from '@/components/ui/deferred-menu';
import { parseTheme, THEMES } from '@/lib/theme';
import { THEME_ICONS } from './theme-icon';
import { useTheme } from './theme-provider';

export default function ThemeMenu({
  trigger,
  openedBy,
}: {
  trigger: ReactElement;
  openedBy: MenuOpenedBy;
}) {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44"
        {...menuAutoFocus(openedBy)}
      >
        <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(parseTheme(value))}
        >
          {THEMES.map((option) => {
            const OptionIcon = THEME_ICONS[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <OptionIcon aria-hidden="true" />
                {t(option)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
