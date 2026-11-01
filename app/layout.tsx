import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { parseTheme, themeClassName } from '@/lib/theme';
import './globals.css';

// A fresh CSP nonce must accompany every HTML response.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    title: t('appName'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(PREFERENCE_COOKIES.theme)?.value);
  return (
    <html lang="uk" className={themeClassName(theme)}>
      <body>{children}</body>
    </html>
  );
}
