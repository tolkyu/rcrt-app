import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

/** Public auth screens: centred card with the «Hiring» brand (docs/ux/design-system.md, S-01/S-02). */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('auth');
  return (
    <NextIntlClientProvider>
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex items-center justify-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-lg bg-brand text-lg font-bold text-primary-foreground"
            >
              {t('brandMark')}
            </span>
            <span className="text-xl font-bold tracking-tight">
              {t('brand')}
            </span>
          </div>
          {children}
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
