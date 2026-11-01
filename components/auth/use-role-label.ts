'use client';

import { useTranslations } from 'next-intl';
import { roleLabelKey } from '@/lib/roles';

/** «Роль · Вертикаль» from the one shared role-name set (D27, D64). */
export function useRoleLabel() {
  const t = useTranslations('common');
  return (role: string, vertical: string | null) => {
    const name = t(`roles.${roleLabelKey(role)}`);
    return vertical ? t('roleInVertical', { role: name, vertical }) : name;
  };
}
