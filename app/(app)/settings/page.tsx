import { notFound, redirect } from 'next/navigation';
import { visibleSettingsSections } from '@/lib/nav';
import { requirePrivilegedSession } from '../_lib/session';

/** `/settings` opens the first section the user may manage. */
export default async function SettingsIndex() {
  const ctx = await requirePrivilegedSession();
  const [first] = visibleSettingsSections(new Set(ctx.auth.grants.keys()));
  if (!first) notFound();
  redirect(first.href);
}
