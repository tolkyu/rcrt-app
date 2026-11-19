import { redirect } from 'next/navigation';
import { landingPath, visibleNavItems } from '@/lib/nav';
import { requireSession } from './_lib/session';

/** `/` = the user's landing section (UI-04-1): the first section their permissions open. */
export default async function Home() {
  const ctx = await requireSession();
  redirect(landingPath(visibleNavItems(new Set(ctx.auth.grants.keys()))));
}
