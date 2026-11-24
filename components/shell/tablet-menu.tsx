'use client';

import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { NavItem } from '@/lib/nav';
import { BrandMark } from './brand';
import { SidebarNav } from './sidebar';

export function TabletMenu({
  items,
  onClose,
  onFocusTrigger,
}: {
  items: readonly NavItem[];
  onClose: () => void;
  onFocusTrigger: () => void;
}) {
  const t = useTranslations('shell');
  const tCommon = useTranslations('common');
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        closeLabel={tCommon('close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onFocusTrigger();
        }}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <SheetTitle className="sr-only">{t('menuTitle')}</SheetTitle>
          <BrandMark />
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4">
          <SidebarNav items={items} onNavigate={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
