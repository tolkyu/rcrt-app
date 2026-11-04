'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { ROLE_DISPLAY_ORDER } from '@/lib/roles';
import { GLOBAL_VERTICAL, USER_STATUSES } from '@/lib/user-constants';
import { userFilterList, type UserSearch } from '@/lib/user-filters';

export function UsersFilterSheet({
  search,
  verticals,
  onApply,
  onReset,
  onClose,
  onRestoreFocus,
}: {
  search: UserSearch;
  verticals: readonly { id: string; name: string }[];
  onApply: (filters: Pick<UserSearch, 'status' | 'role' | 'vertical'>) => void;
  onReset: () => void;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const t = useTranslations('settings.users');
  const tRole = useTranslations('common.roles');
  const tCommon = useTranslations('common');
  const [draft, setDraft] = useState(search);
  const groups = [
    {
      key: 'status',
      label: t('filterStatus'),
      options: USER_STATUSES.map((value) => ({
        value,
        label: t(`status.${value}`),
      })),
    },
    {
      key: 'role',
      label: t('filterRole'),
      options: ROLE_DISPLAY_ORDER.map((value) => ({
        value,
        label: tRole(value),
      })),
    },
    {
      key: 'vertical',
      label: t('filterVertical'),
      options: [
        ...verticals.map(({ id, name }) => ({ value: id, label: name })),
        ...userFilterList(search.vertical)
          .filter(
            (id) =>
              id !== GLOBAL_VERTICAL &&
              !verticals.some((vertical) => vertical.id === id),
          )
          .map((value) => ({ value, label: t('unknownVertical') })),
        { value: GLOBAL_VERTICAL, label: t('globalVertical') },
      ],
    },
  ] as const;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        closeLabel={tCommon('close')}
        className="gap-0 overflow-hidden"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <div className="px-5 py-4 pr-14">
          <SheetTitle>{t('filtersLabel')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('filtersDescription')}
          </SheetDescription>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pb-4">
          {groups.map(({ key, label, options }) => {
            const values = userFilterList<string>(draft[key]);
            return (
              <fieldset key={key} className="mb-4">
                <legend className="text-sm font-semibold">{label}</legend>
                {options.length > 10 && (
                  <p className="text-muted-foreground text-xs">
                    {t('maxFilterValues')}
                  </p>
                )}
                {options.map(({ value, label: optionLabel }) => (
                  <label
                    key={value}
                    className="flex min-h-11 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={values.includes(value)}
                      disabled={!values.includes(value) && values.length >= 10}
                      className="accent-primary size-5"
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...values, value]
                          : values.filter((entry) => entry !== value);
                        setDraft({ ...draft, [key]: next });
                      }}
                    />
                    {optionLabel}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
        <div className="border-border flex shrink-0 flex-col gap-2 border-t bg-inherit p-4 [&>button]:h-12">
          <Button variant="outline" onClick={onReset}>
            {t('resetFilters')}
          </Button>
          <Button
            onClick={() =>
              onApply({
                status: draft.status,
                role: draft.role,
                vertical: draft.vertical,
              })
            }
          >
            {t('applyFilters')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
