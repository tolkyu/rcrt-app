import { useTranslations } from 'next-intl';

/** Column head shared by the list and its skeleton, so the loading table has the same column minimums and head height. `menuColumn`: the last column also carries the draft menu, so it shows below `xl` too. */
export function VacanciesTableHead({
  menuColumn = false,
}: {
  menuColumn?: boolean;
}) {
  const t = useTranslations('vacancies');
  return (
    <thead>
      <tr className="border-border text-muted-foreground border-b text-left text-xs">
        <th scope="col" className="min-w-56 px-4 py-3 font-medium">
          {t('columns.title')}
        </th>
        <th scope="col" className="min-w-28 px-4 py-3 font-medium">
          {t('columns.vertical')}
        </th>
        <th scope="col" className="min-w-44 px-4 py-3 font-medium">
          {t('columns.teamLead')}
        </th>
        <th scope="col" className="min-w-32 px-4 py-3 font-medium">
          {t('columns.status')}
        </th>
        <th
          scope="col"
          className="px-4 py-3 font-medium whitespace-nowrap xl:max-2xl:hidden"
        >
          {t('columns.openedAt')}
        </th>
        <th
          scope="col"
          className={
            menuColumn
              ? 'w-14 px-2 py-3 xl:w-28'
              : 'hidden w-14 px-2 py-3 xl:table-cell'
          }
        >
          <span className="sr-only">{t('columns.preview')}</span>
        </th>
      </tr>
    </thead>
  );
}
