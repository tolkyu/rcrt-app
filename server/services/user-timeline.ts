import type { UserEvent } from '../../lib/schemas/user';
import { EVENT_PAYLOADS } from '../events';
import type { UserEventRow } from '../repositories/user';

type RoleRef = { role: string; verticalId: string | null };

/** Stored payloads carry the schema version `v`, which the strict write allowlists do not accept. */
const withoutVersion = (payload: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'v'));

/** Re-validates the stored payload against the write allowlist, so only known ids/enums ever leave the server. */
function rolesOf(row: UserEventRow): RoleRef[] | null {
  const payload = withoutVersion(row.payload);
  switch (row.type) {
    case 'user.invited':
    case 'user.reinvited':
    case 'user.email_changed': {
      const parsed = EVENT_PAYLOADS[row.type].safeParse(payload);
      return parsed.success ? parsed.data.roles : null;
    }
    case 'user.reactivated': {
      const parsed = EVENT_PAYLOADS['user.reactivated'].safeParse(payload);
      return parsed.success ? parsed.data.restoredRoles : null;
    }
    case 'user.role_assigned':
    case 'user.role_removed': {
      const parsed = EVENT_PAYLOADS[row.type].safeParse(payload);
      return parsed.success ? [parsed.data] : null;
    }
    default:
      return null;
  }
}

function fieldsOf(row: UserEventRow): UserEvent['fields'] {
  if (row.type !== 'user.profile_updated') return null;
  const payload = withoutVersion(row.payload);
  const parsed = EVENT_PAYLOADS['user.profile_updated'].safeParse(payload);
  return parsed.success ? parsed.data.fields : null;
}

/** Timeline item for «Історія»: actor, type and allowlisted role/field summary; payload itself is never returned. */
export function userEventView(row: UserEventRow): UserEvent {
  return {
    id: row.id.toString(),
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    actorKind: row.actorKind,
    actor:
      row.actorId && row.actorName !== null && row.actorActive !== null
        ? {
            id: row.actorId,
            fullName: row.actorName,
            isActive: row.actorActive,
          }
        : null,
    roles:
      rolesOf(row)?.map(({ role, verticalId }) => ({
        role,
        vertical: verticalId
          ? { id: verticalId, name: row.verticalNames[verticalId] ?? null }
          : null,
      })) ?? null,
    fields: fieldsOf(row),
  };
}
