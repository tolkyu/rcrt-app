import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { InviteFlow } from '@/components/auth/invite-flow';
import { googleSignInEnabled } from '@/server/auth/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.invite');
  return { title: t('metaTitle') };
}

/** The token lives in the URL fragment and is only ever sent in a POST body (DG-07, T4-E03). */
export default function InvitePage() {
  return <InviteFlow googleEnabled={googleSignInEnabled()} />;
}
