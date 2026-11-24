import 'server-only';
import { cache } from 'react';
import type { VerticalId } from '@/server/authz/types';
import { vacancyRequestVerticals } from '@/server/authz/vacancy-request';
import { requireSession } from './session';
import { getVisibleVerticals } from './verticals';

/** Verticals where the caller may request a vacancy as Team Lead (D87), shared by the page and its loading skeleton. */
export const getRequestVerticals = cache(async () => {
  const ctx = await requireSession();
  const allowed = vacancyRequestVerticals(ctx.auth);
  const visible = await getVisibleVerticals();
  return visible.items.filter((vertical) =>
    allowed.has(vertical.id as VerticalId),
  );
});
