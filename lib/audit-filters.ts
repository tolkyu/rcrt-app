import {
  AUDIT_PERIODS,
  auditPeriodRange,
  type AuditPeriod,
} from './audit-period';
import type { AuditFilterValues } from './queries/settings';
import { auditActionSelection, parseAuditActions } from './audit-actions';
import {
  AUDIT_ENTITY_TYPES,
  AUDIT_PERIOD_MAX_DAYS,
  AUDIT_SYSTEM_ACTOR,
  type AuditEntityType,
} from './audit-constants';

/** «Журнал дій» state kept in the URL (wireframe settings-admin §0): back button and shareable links. */
export interface AuditSearch {
  readonly period: AuditPeriod | 'custom';
  readonly view?: 'security' | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly action?: string | undefined;
  readonly actions?: string | undefined;
  readonly entityType?: AuditEntityType | undefined;
  readonly entityId?: string | undefined;
  /** User id or `AUDIT_SYSTEM_ACTOR`. */
  readonly actorId?: string | undefined;
  readonly result?: 'SUCCESS' | 'DENIED' | undefined;
  readonly record?: string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchSource =
  Readonly<Record<string, string | string[] | undefined>> | URLSearchParams;

function one(source: SearchSource, key: string) {
  if (source instanceof URLSearchParams) {
    const values = source.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  }
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/** Unknown or malformed values are dropped instead of failing the page. */
export function parseAuditSearch(source: SearchSource): AuditSearch {
  const period = one(source, 'period');
  const action = one(source, 'action');
  const actions = one(source, 'actions');
  const has = (key: string) =>
    source instanceof URLSearchParams
      ? source.has(key)
      : source[key] !== undefined;
  const selected =
    has('action') && has('actions')
      ? []
      : actions
        ? (parseAuditActions(actions) ?? [])
        : action
          ? [action]
          : [];
  const entityType = one(source, 'entityType');
  const entityId = one(source, 'entityId');
  const actorId = one(source, 'actorId');
  const result = one(source, 'result');
  const record = one(source, 'record');
  const from = one(source, 'from');
  const to = one(source, 'to');
  const custom =
    period === 'custom' && from && to && validAuditPeriod(from, to);
  const type = AUDIT_ENTITY_TYPES.find((known) => known === entityType);
  return {
    view: one(source, 'view') === 'security' ? 'security' : undefined,
    period: custom
      ? 'custom'
      : (AUDIT_PERIODS.find((known) => known === period) ?? '7d'),
    from: custom ? from : undefined,
    to: custom ? to : undefined,
    ...auditActionSelection(selected),
    entityType: type,
    entityId: type && entityId && UUID.test(entityId) ? entityId : undefined,
    actorId:
      actorId && (actorId === AUDIT_SYSTEM_ACTOR || UUID.test(actorId))
        ? actorId.toLowerCase()
        : undefined,
    result: result === 'SUCCESS' || result === 'DENIED' ? result : undefined,
    record: record && /^\d{1,19}$/.test(record) ? record : undefined,
  };
}

/** Validate the date form without loading the API's Zod response schemas into the initial bundle. */
export function validAuditPeriod(from: string, to: string): boolean {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  };
  return (
    validDate(from) &&
    validDate(to) &&
    from <= to &&
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000 +
      1 <=
      AUDIT_PERIOD_MAX_DAYS
  );
}

export function selectedAuditActions(search: AuditSearch): string[] {
  return search.actions?.split(',') ?? (search.action ? [search.action] : []);
}

export function auditSearchParams(search: AuditSearch) {
  const params = new URLSearchParams();
  const selection = auditActionSelection(selectedAuditActions(search));
  if (selection.action) params.set('action', selection.action);
  if (selection.actions) params.set('actions', selection.actions);
  if (search.view === 'security') params.set('view', search.view);
  if (search.period !== '7d') params.set('period', search.period);
  for (const key of [
    'entityType',
    'entityId',
    'actorId',
    'result',
    'record',
    'from',
    'to',
  ] as const) {
    const value = search[key];
    if (value) params.set(key, value);
  }
  return params;
}

export function auditApiFilters(
  search: AuditSearch,
  now: Date,
): AuditFilterValues {
  return {
    view: search.view,
    ...(search.period === 'custom'
      ? { from: search.from, to: search.to }
      : auditPeriodRange(search.period, now)),
    action: search.action,
    actions: search.actions,
    entityType: search.entityType,
    entityId: search.entityId,
    actorId: search.actorId,
    result: search.result,
  };
}
