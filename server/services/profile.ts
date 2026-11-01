import type { Me } from '../../lib/schemas/me';
import type { UpdateMeInput } from '../../lib/schemas/profile';
import { updateMeSchema } from '../../lib/schemas/profile';
import { writeAudit } from '../audit';
import type { RequestContext } from '../context/request-context';
import { appendEvent } from '../events';
import { UnauthenticatedError } from '../http/errors';
import { lockUserName, updateUserName } from '../repositories/profile';
import { getMe } from './me';

/**
 * Own display name only (ROLE-05-6): the subject is always the caller, so there is no object to scope.
 * Email stays Admin-only (D44). Audit + `user.profile_updated` (old→new name in the PII side row).
 */
export async function updateMyProfile(
  ctx: RequestContext,
  input: UpdateMeInput,
): Promise<Me> {
  const { fullName } = updateMeSchema.parse(input);
  const userId = ctx.auth.userId;
  await ctx.db.transaction(async (tx) => {
    const current = await lockUserName(tx, userId);
    if (!current) throw new UnauthenticatedError('UNAUTHENTICATED');
    if (current.fullName === fullName) return;
    await updateUserName(tx, userId, fullName, ctx.clock.now());
    await writeAudit(tx, ctx, {
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: userId,
      before: { fullName: current.fullName },
      after: { fullName },
    });
    await appendEvent(tx, ctx, {
      type: 'user.profile_updated',
      subjectType: 'user',
      subjectId: userId,
      payload: { fields: ['fullName'] },
      pii: { fullName: { old: current.fullName, new: fullName } },
    });
  });
  return getMe(ctx);
}
