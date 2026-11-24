import { sql } from 'drizzle-orm';
import { isTeamLeadAssignment } from '../authz/types';

/**
 * D122: the one rule for who may be assigned to a vacancy or hold a priority. The SQL fragment (list, picker, priority
 * save) and the row predicate (create, draft, publish) live together so they cannot drift apart.
 * The aliases are fixed identifiers, never input.
 */
export const eligibleTeamLeadSql = (r: 'r' | 'er', u: 'u' | 'eu') =>
  sql.raw(
    `${r}.role = 'TEAM_LEAD' and ${u}.is_active and ${u}.activated_at is not null`,
  );

export const isEligibleTeamLeadRow = (
  user: { readonly isActive: boolean; readonly activatedAt: Date | null },
  role: { readonly role: string },
) => isTeamLeadAssignment(role) && user.isActive && user.activatedAt !== null;
