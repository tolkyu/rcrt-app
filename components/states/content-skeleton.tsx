import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

export async function ContentSkeleton() {
  const t = await getTranslations('states');
  return (
    <div role="status" className="skeleton-delayed">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-64 rounded-xl lg:col-span-7" />
        <Skeleton className="h-64 rounded-xl lg:col-span-5" />
      </div>
    </div>
  );
}
