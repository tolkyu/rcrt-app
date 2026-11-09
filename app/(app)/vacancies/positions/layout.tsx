import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { positionsClientMessages } from '@/lib/i18n/positions-messages';

/** The catalog strings ship only with this route; the nested provider replaces the shell's messages. */
export default async function PositionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      locale="uk"
      timeZone="Europe/Kyiv"
      messages={positionsClientMessages(messages)}
    >
      {children}
    </NextIntlClientProvider>
  );
}
