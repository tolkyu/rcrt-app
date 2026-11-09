'use client';

import { PanelRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import { cn } from '@/lib/utils';
import { urgentEdge, VacancyFlags, VacancyStatus } from './vacancy-badges';

const INTERACTIVE = 'a,button,input,select,textarea,summary';

function TeamLead({ vacancy }: { vacancy: VacancySummary }) {
  const t = useTranslations('vacancies');
  const { teamLead } = vacancy;
  if (!teamLead)
    return (
      <span className="text-muted-foreground whitespace-nowrap">
        {t('unassigned')}
      </span>
    );
  return (
    <span className="break-words">
      {teamLead.fullName}
      {!teamLead.isActive && (
        <span className="text-muted-foreground"> {t('inactive')}</span>
      )}
    </span>
  );
}

function OpenedAt({ at }: { at: string | null }) {
  const t = useTranslations('vacancies');
  if (!at)
    return (
      <>
        <span aria-hidden="true">{t('emptyValue')}</span>
        <span className="sr-only">{t('notOpenedYet')}</span>
      </>
    );
  return <>{t('date', { at: new Date(at) })}</>;
}

/** Desktop table (md+) and stacked cards (<md); both stay in the DOM and CSS picks one, so there is no hydration swap. Memoized so search keystrokes do not re-render the rows. */
export const VacanciesList = memo(function VacanciesList({
  items,
  selectedId,
  wide,
  onSelect,
  onPreviewIntent,
}: {
  items: readonly VacancySummary[];
  selectedId: string | undefined;
  wide: boolean;
  onSelect: (id: string) => void;
  onPreviewIntent: (id: string) => void;
}) {
  const t = useTranslations('vacancies');
  const selectFromRow = (
    event: MouseEvent<HTMLTableRowElement>,
    id: string,
  ) => {
    if (!wide || (event.target as HTMLElement).closest(INTERACTIVE)) return;
    // A drag that selected text is not a click.
    if (event.detail > 0 && window.getSelection()?.toString()) return;
    onSelect(id);
  };
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('caption')}</caption>
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
              <th scope="col" className="hidden w-14 px-2 py-3 xl:table-cell">
                <span className="sr-only">{t('columns.preview')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((vacancy) => {
              const selected = wide && vacancy.id === selectedId;
              return (
                <tr
                  key={vacancy.id}
                  onClick={(event) => selectFromRow(event, vacancy.id)}
                  className={cn(
                    'border-border hover:bg-surface-muted border-b align-middle last:border-0',
                    selected
                      ? 'bg-primary-subtle hover:bg-primary-subtle shadow-[inset_2px_0_0_0_var(--brand)]'
                      : urgentEdge(vacancy),
                  )}
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/vacancies/${vacancy.id}`}
                        prefetch={false}
                        className="text-foreground inline-flex min-h-6 rounded-sm font-semibold [overflow-wrap:anywhere] hover:underline"
                      >
                        {vacancy.title}
                      </Link>
                      <VacancyFlags vacancy={vacancy} />
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {vacancy.number}
                    </span>
                  </th>
                  <td className="px-4 py-3 break-words">
                    {vacancy.vertical.name}
                  </td>
                  <td className="px-4 py-3">
                    <TeamLead vacancy={vacancy} />
                  </td>
                  <td className="px-4 py-3">
                    <VacancyStatus status={vacancy.status} />
                  </td>
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap tabular-nums xl:max-2xl:hidden">
                    <OpenedAt at={vacancy.openedAt} />
                  </td>
                  <td className="hidden px-2 py-3 xl:table-cell">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-pressed={selected}
                      aria-label={t('previewSelect', { title: vacancy.title })}
                      onClick={() => onSelect(vacancy.id)}
                      onPointerEnter={() => onPreviewIntent(vacancy.id)}
                      onFocus={() => onPreviewIntent(vacancy.id)}
                    >
                      <PanelRight aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul
        aria-label={t('caption')}
        className="divide-border divide-y md:hidden"
      >
        {items.map((vacancy) => (
          <li
            key={vacancy.id}
            className={cn(
              'hover:bg-surface-muted has-[a:focus-visible]:outline-ring relative flex flex-col gap-2 p-4 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2',
              urgentEdge(vacancy),
            )}
          >
            <Link
              href={`/vacancies/${vacancy.id}`}
              prefetch={false}
              className="text-foreground min-h-6 font-semibold [overflow-wrap:anywhere] after:absolute after:inset-0"
            >
              {vacancy.title}
            </Link>
            <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
              {t('numberInVertical', {
                number: vacancy.number,
                vertical: vacancy.vertical.name,
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <VacancyStatus status={vacancy.status} />
              <VacancyFlags vacancy={vacancy} />
            </div>
            <p className="flex flex-wrap gap-x-1 text-sm">
              <span className="text-muted-foreground">
                {t('columns.teamLead')}
              </span>
              <TeamLead vacancy={vacancy} />
            </p>
            {vacancy.openedAt && (
              <p className="text-muted-foreground text-xs">
                {t('openedOn', { at: new Date(vacancy.openedAt) })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
});
