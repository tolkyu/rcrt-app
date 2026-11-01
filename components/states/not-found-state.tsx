import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';

/** One text for missing and forbidden objects, so a 404 never confirms that something exists (VIS-02). */
export async function NotFoundState() {
  const [t, tStates] = await Promise.all([
    getTranslations('errors'),
    getTranslations('states'),
  ]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="bg-primary-subtle flex size-14 items-center justify-center rounded-full">
        <SearchX className="text-brand size-7" aria-hidden="true" />
      </span>
      <h1 className="text-display-xl text-foreground">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground text-sm">
        {t('notFoundDescription')}
      </p>
      <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
        {tStates('toStart')}
      </Link>
    </div>
  );
}
