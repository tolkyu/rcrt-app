'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PREFERENCE_COOKIES, writePreference } from '@/lib/preference-cookie';
import { ALL_VERTICALS, type VerticalOption } from '@/lib/vertical-filter';

/** «Усі мої вертикалі ▾»: only the user's verticals; hidden with fewer than two (design-system §5). */
export function VerticalSwitcher({
  verticals,
  initialValue,
}: {
  verticals: readonly VerticalOption[];
  initialValue: string;
}) {
  const t = useTranslations('shell');
  const [value, setValue] = useState(initialValue);
  if (verticals.length < 2) return null;
  const selected = verticals.find((vertical) => vertical.id === value);
  const label = selected?.name ?? t('allVerticals');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('verticalFilter', { name: label })}
        className="border-border bg-surface text-foreground hover:bg-surface-muted flex h-10 max-w-56 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t('verticalFilterTitle')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            setValue(next);
            writePreference(PREFERENCE_COOKIES.vertical, next);
          }}
        >
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
