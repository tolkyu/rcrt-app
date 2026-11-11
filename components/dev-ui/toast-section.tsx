import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { PREFERENCE_COOKIES } from '@/lib/preference-cookie';
import { parseTheme } from '@/lib/theme';
import { GallerySection } from './gallery-section';
import { ToastDemos } from './toast-demos';
import { ToastPortal } from './toast-portal';

/** The gallery sits outside the app providers, so it brings its own theme context and the lazy Toaster. */
export async function ToastSection() {
  const [t, { common, form, devUi }, cookieStore] = await Promise.all([
    getTranslations('devUi.toasts'),
    getMessages(),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(PREFERENCE_COOKIES.theme)?.value);
  return (
    <GallerySection id="toasts" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ common, form, devUi: { toasts: devUi.toasts } }}
      >
        <ThemeProvider initialTheme={theme}>
          <ToastDemos />
          <ToastPortal>
            <Toaster />
          </ToastPortal>
        </ThemeProvider>
      </NextIntlClientProvider>
    </GallerySection>
  );
}
