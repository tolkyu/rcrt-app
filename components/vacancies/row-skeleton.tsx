import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { VacanciesTableHead } from './vacancies-table-head';

/** One text line: a bar centred in a box as tall as the line it stands for, so row heights match the loaded rows. */
function Line({
  height,
  className,
}: {
  height: 'h-4' | 'h-5' | 'h-6' | 'h-6.5';
  className: string;
}) {
  return (
    <div className={cn('flex items-center', height)}>
      <Skeleton className={cn('h-3 max-w-full', className)} />
    </div>
  );
}

/** Loading twin of `VacanciesList` (G20): shares the real thead, paddings and line boxes so content replaces it without a shift. */
export function RowSkeleton({
  count = 8,
  menuColumn = false,
}: {
  count?: number;
  menuColumn?: boolean;
}) {
  const t = useTranslations('states');
  const rows = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" data-slot="row-skeleton" className="skeleton-delayed">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden="true">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <VacanciesTableHead menuColumn={menuColumn} />
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row}
                  className="border-border border-b align-middle last:border-0"
                >
                  <td className="px-4 py-3">
                    <Line height="h-6" className="w-56" />
                    <Line height="h-5" className="w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Line height="h-5" className="w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Line height="h-5" className="w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Line height="h-5" className="w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-6.5 w-24 rounded-full" />
                  </td>
                  <td className="px-4 py-3 xl:max-2xl:hidden">
                    <Line height="h-5" className="w-20" />
                  </td>
                  <td
                    className={cn(
                      'px-2 py-3',
                      !menuColumn && 'hidden xl:table-cell',
                    )}
                  >
                    <div className="flex items-center justify-end">
                      <div className="hidden size-11 items-center justify-center xl:flex">
                        <Skeleton className="size-4" />
                      </div>
                      {menuColumn && <div className="size-11 xl:hidden" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-border divide-y md:hidden">
          {rows.map((row) => (
            <li key={row} className="flex flex-col gap-2 p-4">
              <Line height="h-6" className="w-3/4" />
              <Line height="h-4" className="w-1/2" />
              <div className="flex h-6.5 items-center">
                <Skeleton className="h-6.5 w-24 rounded-full" />
              </div>
              <Line height="h-5" className="w-2/3" />
              <Line height="h-4" className="w-1/3" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
