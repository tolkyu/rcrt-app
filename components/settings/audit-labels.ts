'use client';

import { useTranslations } from 'next-intl';
import type { AuditEntry } from '@/lib/schemas/audit';
import type messages from '@/messages/uk.json';

type AuditMessages = typeof messages.settings.audit;
type ActionCode = {
  [
    Group in keyof AuditMessages['actions']
  ]: `${Group}.${keyof AuditMessages['actions'][Group] & string}`;
}[keyof AuditMessages['actions']];

const shortId = (id: string) => `#${id.slice(0, 8)}`;

/** Localized audit labels; unknown codes stay readable instead of breaking (wireframe §3.1, §3.4). */
export function useAuditLabels() {
  const t = useTranslations('settings.audit');
  const action = (code: string) => {
    const key = `actions.${code}` as `actions.${ActionCode}`;
    return t.has(key) ? t(key) : t('actionUnknown', { code });
  };
  const actor = (
    entry: Pick<AuditEntry, 'actor' | 'actorKind' | 'action' | 'entity'>,
  ) => {
    if (entry.actor)
      return entry.actor.isActive
        ? entry.actor.fullName
        : `${entry.actor.fullName} ${t('deactivatedSuffix')}`;
    return entry.action === 'auth.login_failed' && !entry.entity
      ? t('actorUnknown')
      : t('system');
  };
  const entityType = (type: string) => {
    return type === 'user' || type === 'vertical'
      ? t(`entityTypes.${type}`)
      : type;
  };
  const entity = (value: AuditEntry['entity']) =>
    value
      ? t('entityLabel', {
          type: entityType(value.type),
          label: value.label ?? shortId(value.id),
        })
      : null;
  const reason = (code: string) => {
    const key =
      `reasons.${code}` as `reasons.${keyof AuditMessages['reasons']}`;
    return t.has(key) ? t(key, { code }) : t('reasons.unknown', { code });
  };
  const field = (name: string) => {
    const key = `fields.${name}` as `fields.${keyof AuditMessages['fields']}`;
    return t.has(key) ? t(key) : name;
  };
  return { action, actor, entity, entityType, reason, field, shortId };
}
