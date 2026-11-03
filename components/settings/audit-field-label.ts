'use client';

import { useTranslations } from 'next-intl';
import type messages from '@/messages/uk.json';

type Fields = typeof messages.settings.audit.fields;

export function useAuditFieldLabel() {
  const t = useTranslations('settings.audit');
  return (name: string) => {
    const key = `fields.${name}` as `fields.${keyof Fields}`;
    return t.has(key) ? t(key) : name;
  };
}
