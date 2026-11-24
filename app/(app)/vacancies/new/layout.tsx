import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { vacancyFormClientMessages } from '@/lib/i18n/vacancy-form-messages';
import { authorsAnywhere } from '@/server/authz/vacancy-author';
import { requireSession } from '../../_lib/session';

/** Decided above the loading boundary so a role that cannot author gets an actual HTTP 404 (VIS-02, D89); the form strings ship only with this route. */
export default async function NewVacancyLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireSession();
  if (!authorsAnywhere(ctx.auth)) notFound();
  return (
    <NextIntlClientProvider
      locale="uk"
      timeZone="Europe/Kyiv"
      messages={vacancyFormClientMessages(await getMessages())}
    >
      {children}
    </NextIntlClientProvider>
  );
}
