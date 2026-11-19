import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import {
  parseTheme,
  THEME_COLOR_MEDIA,
  themeClassName,
  themeColorFor,
} from '@/lib/theme';
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

async function currentTheme() {
  const cookieStore = await cookies();
  return parseTheme(cookieStore.get(PREFERENCE_COOKIES.theme)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    interactiveWidget: 'resizes-content',
    themeColor: (['light', 'dark'] as const).map((scheme) => ({
      media: THEME_COLOR_MEDIA[scheme],
      color: themeColorFor(theme, scheme),
    })),
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = await currentTheme();
  return (
    <html lang="uk" className={themeClassName(theme)}>
      <body>{children}</body>
    </html>
  );
}
