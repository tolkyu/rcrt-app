'use client';

import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import {
  auditRecordQuery,
  settingsVerticalsQuery,
} from '@/lib/queries/settings';
import { roleLabelKey } from '@/lib/roles';
import type { AuditEntry, AuditRecord } from '@/lib/schemas/audit';
import { AUDIT_ENTITY_TYPES } from '@/lib/audit-constants';
import type messages from '@/messages/uk.json';
import { useAuditLabels } from './audit-labels';
import { useAuditFieldLabel } from './audit-field-label';

type Json = AuditRecord['before'];
type AuditMessages = typeof messages.settings.audit;

function asObject(value: Json): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function isRoleList(
  value: Json,
): value is { role: string; verticalId: string | null }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof item.role === 'string' &&
        (item.verticalId === null || typeof item.verticalId === 'string'),
    )
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Shows only what the audit row stores (wireframe §3.2); known fields localized, the rest raw. */
export function AuditRecordSheet({
  recordId,
  onClose,
  onShowEntityHistory,
}: {
  recordId: string;
  onClose: () => void;
  onShowEntityHistory: (entity: NonNullable<AuditEntry['entity']>) => void;
}) {
  const t = useTranslations('settings.audit');
  const tRoles = useTranslations('common.roles');
  const tPriority = useTranslations('settings.priorities');
  const labels = useAuditLabels();
  const fieldLabel = useAuditFieldLabel();
  const reasonLabel = (code: string) => {
    const key =
      `reasons.${code}` as `reasons.${keyof AuditMessages['reasons']}`;
    return t.has(key) ? t(key, { code }) : t('reasons.unknown', { code });
  };
  const record = useQuery(auditRecordQuery(recordId));
  const verticals = useQuery(settingsVerticalsQuery());
  const [showJson, setShowJson] = useState(false);
  const verticalName = (id: string | null) =>
    id
      ? (verticals.data?.items.find((item) => item.id === id)?.name ??
        labels.shortId(id))
      : null;

  const value = (raw: Json | undefined): string => {
    if (raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0))
      return t('detail.emptyValue');
    if (isRoleList(raw))
      return raw
        .map((item) =>
          [tRoles(roleLabelKey(item.role)), verticalName(item.verticalId)]
            .filter(Boolean)
            .join(' · '),
        )
        .join(', ');
    if (typeof raw === 'object') return JSON.stringify(raw);
    if (typeof raw === 'boolean') return t(`detail.${raw}`);
    return String(raw);
  };
  /** Team Lead priority reads «П1» / «не задано» like the priorities screen (wireframe P1.5). */
  const change = (key: string, raw: Json | undefined) =>
    key === 'priority' && (raw === null || typeof raw === 'number')
      ? raw === null
        ? tPriority('valueNone')
        : tPriority('valueShort', { priority: raw })
      : value(raw);

  let body: ReactNode;
  const data = record.data;
  if (!data) {
    body =
      record.error instanceof ApiError && record.error.status === 404 ? (
        <EmptyState icon={SearchX} title={t('detail.notFound')} />
      ) : record.isError ? (
        <SectionError
          onRetry={() => void record.refetch()}
          retrying={record.isFetching}
        />
      ) : (
        <div className="skeleton-delayed flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      );
  } else {
    const before = asObject(data.before);
    const after = asObject(data.after);
    const changed = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ];
    const { reason, ...rest } = asObject(data.details);
    const details = Object.entries(rest);
    const occurredAt = new Date(data.occurredAt);
    body = (
      <>
        <dl className="divide-border divide-y">
          <Row label={t('detail.time')}>
            <span className="block">
              {t('detail.timeKyiv', { at: occurredAt })}
            </span>
            <span className="text-muted-foreground block font-mono text-xs">
              {t('detail.timeUtc', {
                at: data.occurredAt.replace('T', ' ').replace(/\.\d+Z$/, ''),
              })}
            </span>
          </Row>
          <Row label={t('detail.actor')}>{labels.actor(data)}</Row>
          {data.result === 'DENIED' && typeof reason === 'string' && (
            <Row label={t('detail.reason')}>{reasonLabel(reason)}</Row>
          )}
          {data.entity && (
            <Row label={t('detail.entity')}>
              <span className="block">{labels.entity(data.entity)}</span>
              {AUDIT_ENTITY_TYPES.some(
                (type) => type === data.entity?.type,
              ) && (
                <button
                  type="button"
                  onClick={() => onShowEntityHistory(data.entity!)}
                  className="text-link text-sm hover:underline"
                >
                  {t('detail.entityHistory')}
                </button>
              )}
            </Row>
          )}
          <Row label={t('detail.ip')}>{data.ip ?? t('detail.emptyValue')}</Row>
          {data.userAgent && (
            <Row label={t('detail.userAgent')}>
              <span className="font-mono text-xs">{data.userAgent}</span>
            </Row>
          )}
          {data.requestId && (
            <Row label={t('detail.requestId')}>
              <span className="font-mono text-xs">{data.requestId}</span>
            </Row>
          )}
        </dl>
        <section className="flex flex-col gap-2">
          <h3 className="text-foreground text-sm font-semibold">
            {t('detail.changes')}
          </h3>
          {changed.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('detail.noChanges')}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs">
                  <th scope="col" className="py-2 pr-2 font-medium">
                    {t('detail.field')}
                  </th>
                  <th scope="col" className="py-2 pr-2 font-medium">
                    {t('detail.before')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t('detail.after')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {changed.map((key) => (
                  <tr
                    key={key}
                    className="border-border border-b align-top last:border-0"
                  >
                    <th scope="row" className="py-2 pr-2 text-left font-medium">
                      {fieldLabel(key)}
                    </th>
                    <td className="py-2 pr-2 break-words">
                      {change(key, before[key])}
                    </td>
                    <td className="py-2 break-words">
                      {change(key, after[key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {details.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-foreground text-sm font-semibold">
              {t('detail.details')}
            </h3>
            <dl className="divide-border divide-y">
              {details.map(([key, raw]) => (
                <Row key={key} label={fieldLabel(key)}>
                  {(typeof raw === 'string' && data.detailLabels[raw]) ||
                    value(raw)}
                </Row>
              ))}
            </dl>
          </section>
        )}
        <div>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={showJson}
            onClick={() => setShowJson((shown) => !shown)}
          >
            {showJson ? t('detail.hideJson') : t('detail.showJson')}
          </Button>
          {showJson && (
            <pre className="bg-surface-muted mt-2 overflow-x-auto rounded-lg p-3 font-mono text-xs break-words whitespace-pre-wrap">
              {JSON.stringify(
                {
                  before: data.before,
                  after: data.after,
                  details: data.details,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        closeLabel={t('detail.close')}
        className="gap-4 p-6"
      >
        <SheetTitle className="pr-10">
          {data ? labels.action(data.action) : t('detail.title')}
        </SheetTitle>
        <SheetDescription className="font-mono text-xs">
          {data
            ? `${data.action} · ${t(`result.${data.result}`)}`
            : t('detail.title')}
        </SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  );
}
