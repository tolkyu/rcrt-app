'use client';

import { UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type RefObject } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import {
  canClaimRow,
  focusAfterRow,
  focusRowTitle,
  grantsClaim,
  type SelfAssignVerticals,
} from '@/lib/vacancy-claim';
import { LazyClaimDialog, LazyDialog } from './lazy-dialog';
import type { TeamNext } from './use-team-write';

const AVATARS = 3;

/**
 * The claim button of a list row and its confirm dialog. The host stays mounted when the button gives way to the
 * viewer's avatar, so the dialog and its focus move outlive the button (wireframe vacancies-list V3, claim-vacancy §3.3).
 */
function ClaimHost({
  vacancy,
  layout,
  anchor,
  showButton,
}: {
  vacancy: Pick<VacancySummary, 'id' | 'number' | 'title'>;
  layout: 'cell' | 'card';
  anchor: RefObject<HTMLElement | null>;
  showButton: boolean;
}) {
  const t = useTranslations('vacancies.team');
  const [open, setOpen] = useState(false);
  const after = useRef<'self' | 'next' | null>(null);
  const onClose = (next: TeamNext | null) => {
    setOpen(false);
    after.current = next === 'done' ? 'self' : next === 'lost' ? 'next' : null;
  };
  const onCloseAutoFocus = (event: Event) => {
    const target = after.current;
    after.current = null;
    if (!target) return;
    event.preventDefault();
    if (target === 'next') focusAfterRow(vacancy.id);
    else if (layout === 'cell') anchor.current?.focus();
    else focusRowTitle(vacancy.id);
  };
  return (
    <>
      {!showButton ? null : layout === 'cell' ? (
        <Button
          variant="outline"
          size="sm"
          className="relative h-8 after:absolute after:-inset-1.5"
          aria-label={t('claimRowLabel', {
            number: vacancy.number,
            title: vacancy.title,
          })}
          onClick={() => setOpen(true)}
        >
          {t('claimRow')}
        </Button>
      ) : (
        <Button
          variant="outline"
          className="relative z-10 h-11 w-full text-base"
          onClick={() => setOpen(true)}
        >
          {t('claim')}
        </Button>
      )}
      <LazyDialog open={open} onFailed={() => setOpen(false)}>
        <LazyClaimDialog
          vacancy={vacancy}
          onClose={onClose}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      </LazyDialog>
    </>
  );
}

/** Mobile card footer: only an unassigned `OPEN` vacancy of the viewer's vertical has one. */
export function ClaimCard({
  vacancy,
  verticals,
}: {
  vacancy: VacancySummary;
  verticals: SelfAssignVerticals;
}) {
  const anchor = useRef<HTMLElement>(null);
  if (!grantsClaim(vacancy, verticals)) return null;
  return (
    <ClaimHost
      vacancy={vacancy}
      layout="card"
      anchor={anchor}
      showButton={canClaimRow(vacancy, verticals)}
    />
  );
}

/** «Рекрутери» cell of the desktop table (wireframe vacancies-list V3). */
export function RecruiterCell({
  vacancy,
  verticals,
}: {
  vacancy: VacancySummary;
  verticals: SelfAssignVerticals;
}) {
  const t = useTranslations('vacancies.team');
  const tList = useTranslations('vacancies');
  const anchor = useRef<HTMLDivElement>(null);
  const { recruiters, status } = vacancy;
  const claimable = canClaimRow(vacancy, verticals);
  const names = recruiters.map((person) => person.fullName).join(', ');
  let content;
  if (recruiters.length > 0)
    content = (
      <div className="flex items-center gap-1" title={names}>
        {recruiters.slice(0, AVATARS).map((person) => (
          <Avatar key={person.id} name={person.fullName} className="size-8" />
        ))}
        {recruiters.length > AVATARS && (
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            {t('moreAvatars', { count: recruiters.length - AVATARS })}
          </span>
        )}
        <span className="sr-only">{t('recruitersOf', { names })}</span>
      </div>
    );
  else if (claimable) content = null;
  else if (status === 'OPEN' || status === 'ON_HOLD')
    content = (
      <span className="text-warning-text inline-flex items-center gap-1.5 whitespace-nowrap">
        <UserX aria-hidden="true" className="size-4" />
        {tList('unassigned')}
      </span>
    );
  else
    content = (
      <span className="text-muted-foreground">
        <span aria-hidden="true">{tList('emptyValue')}</span>
        <span className="sr-only">{tList('unassigned')}</span>
      </span>
    );
  return (
    <div ref={anchor} tabIndex={-1} className="outline-none">
      {content}
      {grantsClaim(vacancy, verticals) && (
        <ClaimHost
          vacancy={vacancy}
          layout="cell"
          anchor={anchor}
          showButton={claimable}
        />
      )}
    </div>
  );
}
