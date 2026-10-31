import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p>{t('notFoundDescription')}</p>
    </main>
  );
}
