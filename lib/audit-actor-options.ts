import { AUDIT_SYSTEM_ACTOR } from './audit-constants';
import type { AuditActor } from './schemas/audit';

export interface AuditActorOption {
  /** User id or `AUDIT_SYSTEM_ACTOR`; the value kept in the URL. */
  readonly value: string;
  readonly actor: AuditActor | null;
}

/** «Система» is not a user row: it leads the list with no search, or when its label matches the search. */
export function auditActorOptions(
  term: string | undefined,
  users: readonly AuditActor[],
  systemLabel: string,
): AuditActorOption[] {
  const system =
    !term ||
    systemLabel.toLocaleLowerCase('uk').includes(term.toLocaleLowerCase('uk'));
  return [
    ...(system ? [{ value: AUDIT_SYSTEM_ACTOR, actor: null }] : []),
    ...users.map((actor) => ({ value: actor.id, actor })),
  ];
}

/** Arrow keys clamp at the ends (no wrap), so holding ↓ on the last row can ask for the next page instead. */
export function moveActiveOption(
  current: number,
  key: 'ArrowDown' | 'ArrowUp',
  count: number,
): number {
  if (count === 0) return -1;
  return Math.min(
    count - 1,
    Math.max(0, current + (key === 'ArrowDown' ? 1 : -1)),
  );
}
