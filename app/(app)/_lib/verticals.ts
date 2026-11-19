import 'server-only';
import { cache } from 'react';
import { hasAnyGrant } from '@/server/authz/can';
import { listVisibleVerticals } from '@/server/services/vertical';
import { requireSession } from './session';

/** The layout and a page that needs the same list share one query per request; `readable` says whether the role may read verticals at all. */
export const getVisibleVerticals = cache(async () => {
  const ctx = await requireSession();
  const readable = hasAnyGrant(ctx.auth, 'vertical.read');
  return {
    readable,
    items: readable ? (await listVisibleVerticals(ctx)).items : [],
  };
});
