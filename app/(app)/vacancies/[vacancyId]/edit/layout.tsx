import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { vacancyFormClientMessages } from '@/lib/i18n/vacancy-form-messages';
import type { VerticalId } from '@/server/authz/types';
import { vacancyAuthorKind } from '@/server/authz/vacancy-author';
import { requireSession } from '../../../_lib/session';
import { loadVacancy } from '../../_lib/vacancy';

/** Decided above the loading boundary so a role that cannot author in the vacancy's vertical gets an actual HTTP 404 (VIS-02, D89, D92); the form strings ship only with this route. */
export default async function EditVacancyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ vacancyId: string }>;
}) {
  const [ctx, vacancy] = await Promise.all([
    requireSession(),
    params.then(({ vacancyId }) => loadVacancy(vacancyId)),
  ]);
  if (
    !vacancy ||
    !vacancyAuthorKind(ctx.auth, vacancy.vertical.id as VerticalId)
  )
    notFound();
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
