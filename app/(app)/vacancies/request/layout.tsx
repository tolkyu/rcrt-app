import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { vacancyRequestClientMessages } from '@/lib/i18n/vacancy-request-messages';
import { requestsAnywhere } from '@/server/authz/vacancy-request';
import { requireSession } from '../../_lib/session';

/** Decided above the loading boundary so a role that is not a Team Lead gets an actual HTTP 404 (D87). */
export default async function RequestVacancyLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireSession();
  if (!requestsAnywhere(ctx.auth)) notFound();
  return (
    <NextIntlClientProvider
      locale="uk"
      timeZone="Europe/Kyiv"
      messages={vacancyRequestClientMessages(await getMessages())}
    >
      {children}
    </NextIntlClientProvider>
  );
}
