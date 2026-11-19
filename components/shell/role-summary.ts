'use client';

import { useTranslations } from 'next-intl';
import { roleLabelKey, roleSummary, type RoleView } from '@/lib/roles';

/** «Роль · Вертикаль» labels (D64: role and vertical, never a job title). */
export function useRoleLabels() {
  const t = useTranslations('common');
  const label = (role: RoleView) => {
    const name = t(`roles.${roleLabelKey(role.role)}`);
    return role.vertical
      ? t('roleInVertical', { role: name, vertical: role.vertical.name })
      : name;
  };
  const summary = (roles: readonly RoleView[]) => {
    const result = roleSummary(roles);
    if (!result) return '';
    const text = label(result.primary);
    return result.others > 0
      ? t('moreCount', { text, count: result.others })
      : text;
  };
  return { label, summary };
}
