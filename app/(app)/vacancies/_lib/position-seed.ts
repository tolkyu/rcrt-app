import 'server-only';
import type { RequestContext } from '@/server/context/request-context';
import { describeError, logger } from '@/server/observability/logger';
import { listPositionCatalog } from '@/server/services/position';

/** Active positions of a vertical for the form's first open, with the age they have from this load; a failure is logged (no names or ids) and the picker loads the list itself. */
export const loadPositionSeed = (ctx: RequestContext, verticalId: string) =>
  listPositionCatalog(ctx, { status: 'active', verticalId }).then(
    (list) => ({ list, loadedAt: ctx.clock.now().getTime() }),
    (error: unknown) => {
      logger.error(
        { err: describeError(error) },
        'vacancy form position prefetch failed',
      );
      return undefined;
    },
  );
