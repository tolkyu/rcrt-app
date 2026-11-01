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
import { ALL_VERTICALS, type VerticalOption } from '@/lib/vertical-filter';

export default function VerticalSwitcherMenu({
  trigger,
  openedBy,
  verticals,
  value,
  onChange,
}: {
  trigger: ReactElement;
  openedBy: MenuOpenedBy;
  verticals: readonly VerticalOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('shell');
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" {...menuAutoFocus(openedBy)}>
        <DropdownMenuLabel>{t('verticalFilterTitle')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value={ALL_VERTICALS}>
            {t('allVerticals')}
          </DropdownMenuRadioItem>
          {verticals.map((vertical) => (
            <DropdownMenuRadioItem key={vertical.id} value={vertical.id}>
              {vertical.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
