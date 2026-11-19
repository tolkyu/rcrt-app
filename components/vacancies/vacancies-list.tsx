'use client';

import { PanelRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import type { SelfAssignVerticals } from '@/lib/vacancy-claim';
import { cn } from '@/lib/utils';
import { hasRowMenu } from '@/lib/vacancy-draft-actions';
import {
  rowStatusActions,
  type StatusGrantMirror,
} from '@/lib/vacancy-status-menu';
import { DraftRowMenu } from './draft-row-menu';
import { ClaimCard, RecruiterCell } from './recruiter-cell';
import { StatusRowMenu } from './status-row-menu';
import { VacanciesTableHead } from './vacancies-table-head';
import { urgentRow, VacancyFlags, VacancyStatus } from './vacancy-badges';

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

/** A draft without a position cannot be published yet, so its row says so next to the number (spec §6.1). */
function MissingPosition({ vacancy }: { vacancy: VacancySummary }) {
  const t = useTranslations('vacancies.draft');
  if (vacancy.status !== 'DRAFT' || vacancy.position) return null;
  return (
    <span className="before:mx-1 before:content-['·']">{t('noPosition')}</span>
  );
}

function OpenedAt({ at, draft }: { at: string | null; draft: boolean }) {
  const t = useTranslations('vacancies');
  if (!at && draft) return <>{t('notOpenedYet')}</>;
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
  canAuthorDrafts,
  selfAssignVerticals,
  statusGrants,
}: {
  items: readonly VacancySummary[];
  selectedId: string | undefined;
  wide: boolean;
  onSelect: (id: string) => void;
  onPreviewIntent: (id: string) => void;
  canAuthorDrafts: boolean;
  selfAssignVerticals: SelfAssignVerticals;
  statusGrants: StatusGrantMirror | null;
}) {
  const t = useTranslations('vacancies');
  /** The table keeps the menu column below `xl` only when some row can have a menu. */
  const menuColumn = canAuthorDrafts || statusGrants !== null;
  const selectFromRow = (
    event: MouseEvent<HTMLTableRowElement>,
    id: string,
  ) => {
    const target = event.target as HTMLElement;
    // A portalled menu still bubbles its clicks through React to the row; they are not clicks on the row.
    if (!wide || !event.currentTarget.contains(target)) return;
    if (target.closest(INTERACTIVE)) return;
    // A drag that selected text is not a click.
    if (event.detail > 0 && window.getSelection()?.toString()) return;
    onSelect(id);
  };
  return (
    <>
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <VacanciesTableHead menuColumn={menuColumn} />
          <tbody>
            {items.map((vacancy) => {
              const selected = wide && vacancy.id === selectedId;
              return (
                <tr
                  key={vacancy.id}
                  onClick={(event) => selectFromRow(event, vacancy.id)}
                  className={cn(
                    'border-border border-b align-middle last:border-0',
                    urgentRow(vacancy, selected) ??
                      (selected
                        ? 'bg-primary-subtle shadow-[inset_2px_0_0_0_var(--brand)]'
                        : 'hover:bg-surface-muted active:bg-surface-muted'),
                  )}
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/vacancies/${vacancy.id}`}
                          prefetch={false}
                          data-vacancy-link={vacancy.id}
                          className="text-foreground inline-flex min-h-6 rounded-sm font-semibold [overflow-wrap:anywhere] hover:underline"
                        >
                          {vacancy.title}
                        </Link>
                        <VacancyFlags vacancy={vacancy} />
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {vacancy.number}
                        <MissingPosition vacancy={vacancy} />
                      </span>
                    </div>
                  </th>
                  <td className="px-4 py-3 break-words">
                    {vacancy.vertical.name}
                  </td>
                  <td className="px-4 py-3">
                    <TeamLead vacancy={vacancy} />
                  </td>
                  <td className="px-4 py-3">
                    <RecruiterCell
                      vacancy={vacancy}
                      verticals={selfAssignVerticals}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <VacancyStatus status={vacancy.status} />
                  </td>
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap tabular-nums xl:max-2xl:hidden">
                    <OpenedAt
                      at={vacancy.openedAt}
                      draft={vacancy.status === 'DRAFT'}
                    />
                  </td>
                  <td
                    className={cn(
                      'px-2 py-3',
                      !menuColumn && 'hidden xl:table-cell',
                    )}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <DraftRowMenu
                        vacancy={vacancy}
                        canAuthorDrafts={canAuthorDrafts}
                      />
                      <StatusRowMenu
                        vacancy={vacancy}
                        actions={rowStatusActions(vacancy, statusGrants)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hidden size-11 xl:inline-flex"
                        aria-pressed={selected}
                        aria-label={t('previewSelect', {
                          title: vacancy.title,
                        })}
                        onClick={() => onSelect(vacancy.id)}
                        onPointerEnter={() => onPreviewIntent(vacancy.id)}
                        onFocus={() => onPreviewIntent(vacancy.id)}
                      >
                        <PanelRight aria-hidden="true" />
                      </Button>
                    </div>
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
        {items.map((vacancy) => {
          const statusActions = rowStatusActions(vacancy, statusGrants);
          const menu =
            hasRowMenu(vacancy, canAuthorDrafts) || statusActions.length > 0;
          return (
            <li
              key={vacancy.id}
              className={cn(
                'has-[a:focus-visible]:outline-ring relative flex flex-col gap-2 p-4 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2',
                urgentRow(vacancy) ??
                  'hover:bg-surface-muted active:bg-surface-muted',
              )}
            >
              <Link
                href={`/vacancies/${vacancy.id}`}
                prefetch={false}
                data-vacancy-link={vacancy.id}
                className={cn(
                  'text-foreground min-h-6 font-semibold [overflow-wrap:anywhere] after:absolute after:inset-0',
                  menu && 'pr-11',
                )}
              >
                {vacancy.title}
              </Link>
              {menu && (
                <div className="absolute top-2 right-2 z-10">
                  <DraftRowMenu
                    vacancy={vacancy}
                    canAuthorDrafts={canAuthorDrafts}
                  />
                  <StatusRowMenu vacancy={vacancy} actions={statusActions} />
                </div>
              )}
              <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                {t('numberInVertical', {
                  number: vacancy.number,
                  vertical: vacancy.vertical.name,
                })}
                <MissingPosition vacancy={vacancy} />
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <VacancyStatus status={vacancy.status} />
                <VacancyFlags vacancy={vacancy} />
              </div>
              <p className="flex flex-wrap gap-x-1 text-sm">
                <span className="text-muted-foreground">
                  {t('teamLeadLine')}
                </span>
                <TeamLead vacancy={vacancy} />
              </p>
              <ClaimCard vacancy={vacancy} verticals={selfAssignVerticals} />
              {vacancy.openedAt ? (
                <p className="text-muted-foreground text-xs">
                  {t('openedOn', { at: new Date(vacancy.openedAt) })}
                </p>
              ) : (
                vacancy.status === 'DRAFT' && (
                  <p className="text-muted-foreground text-xs">
                    {t('notOpenedYet')}
                  </p>
                )
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
});
