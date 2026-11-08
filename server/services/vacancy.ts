import {
  formatVacancyNumber,
  vacancyListQuerySchema,
  type VacancyDetail,
  type VacancyListQuery,
  type VacancyPage,
} from '../../lib/schemas/vacancy';
import { requirePermission } from '../authz/can';
import { findVisibleOrThrow, scopeWhere } from '../authz/scopes';
import { vacancyScope } from '../authz/vacancy-scope';
import { rateLimitSecret } from '../config/runtime';
import type { RequestContext } from '../context/request-context';
import { NotFoundError } from '../http/errors';
import { uuidOf } from '../http/params';
import {
  findVacancy,
  listVacancies,
  type VacancySummaryRow,
} from '../repositories/vacancy';
import { consumeSearchRateLimit } from '../security/rate-limit';

function present<T extends VacancySummaryRow>({
  publicNo,
  openedAt,
  createdAt,
  updatedAt,
  ...rest
}: T) {
  return {
    ...rest,
    number: formatVacancyNumber(BigInt(publicNo)),
    openedAt: openedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export async function listVacancyPage(
  ctx: RequestContext,
  input: VacancyListQuery,
): Promise<VacancyPage> {
  requirePermission(ctx.auth, 'vacancy.read');
  const filters = vacancyListQuerySchema.parse(input);
  if (filters.q) await consumeSearchRateLimit(ctx, rateLimitSecret());
  const result = await listVacancies(
    ctx.db,
    scopeWhere(ctx.auth, 'vacancy.read', vacancyScope),
    filters,
  );
  const first = result.items[0];
  const last = result.items.at(-1);
  return {
    items: result.items.map((row) => present(row)),
    nextCursor: result.hasOlder && last ? last.publicNo : null,
    prevCursor: result.hasNewer && first ? first.publicNo : null,
  };
}

export async function getVacancyDetail(
  ctx: RequestContext,
  rawId: string,
): Promise<VacancyDetail> {
  requirePermission(ctx.auth, 'vacancy.read');
  const id = uuidOf(rawId);
  if (!id) throw new NotFoundError();
  const row = await findVisibleOrThrow(
    ctx.auth,
    'vacancy.read',
    vacancyScope,
    (scope) => findVacancy(ctx.db, scope, id),
  );
  return present(row);
}
