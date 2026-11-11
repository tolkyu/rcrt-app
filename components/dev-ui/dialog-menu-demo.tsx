'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  menuAutoFocus,
  type MenuOpenedBy,
} from '@/components/ui/deferred-menu';

export default function DialogMenuDemo({
  trigger,
  openedBy,
}: {
  trigger: ReactElement;
  openedBy: MenuOpenedBy;
}) {
  const t = useTranslations('devUi.dialogs');
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" {...menuAutoFocus(openedBy)}>
        <DropdownMenuItem>{t('menuView')}</DropdownMenuItem>
        <DropdownMenuItem>{t('menuEdit')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
