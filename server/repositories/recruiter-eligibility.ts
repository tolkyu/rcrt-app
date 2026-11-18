import { sql } from 'drizzle-orm';
import { isRecruiterAssignment } from '../authz/types';

/** D130(1): the one rule for who may be a vacancy recruiter; the picker SQL and the row predicate (assign, claim) live together. The aliases are fixed identifiers, never input. */
export const eligibleRecruiterSql = (r: 'r' | 'er', u: 'u' | 'eu') =>
  sql.raw(
    `${r}.role = 'RECRUITER' and ${u}.is_active and ${u}.activated_at is not null`,
  );

export const isEligibleRecruiterRow = (
  user: { readonly isActive: boolean; readonly activatedAt: Date | null },
  role: { readonly role: string },
) => isRecruiterAssignment(role) && user.isActive && user.activatedAt !== null;
