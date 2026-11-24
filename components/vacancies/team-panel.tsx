'use client';

import { UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lazy, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { LazyClaimDialog, LazyDialog } from './lazy-dialog';
import { StepUpAction } from './step-up-action';
import type { TeamNext } from './use-team-write';

const AssignRecruitersDialog = lazy(() => import('./assign-recruiters-dialog'));
const RemoveRecruiterDialog = lazy(() => import('./remove-recruiter-dialog'));
const TeamLeadDialog = lazy(() => import('./team-lead-dialog'));

type Person = VacancyDetail['recruiters'][number];
type Dialog =
  | { kind: 'claim' | 'assign' | 'teamLead' }
  | { kind: 'remove'; recruiter: Person };
type FocusTarget = 'recruiters' | 'teamLead';

/** Beyond this many recruiters the list folds behind «Ще N» (wireframe §2). */
const VISIBLE = 5;

function PersonRow({
  person,
  caption,
  onRemove,
}: {
  person: Person;
  caption: string;
  onRemove?: () => void;
}) {
  const t = useTranslations('vacancies.team');
  return (
    <li className="flex min-h-11 items-center gap-3">
      <Avatar name={person.fullName} />
      <span className="min-w-0 flex-1 text-sm">
        <span
          title={person.fullName}
          className="text-foreground block truncate font-medium"
        >
          {person.fullName}
        </span>
        <span className="text-muted-foreground block text-xs">{caption}</span>
      </span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t('removeLabel', { name: person.fullName })}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

/**
 * «Команда» of the card and the preview (STORY-VAC-03-1, VAC-03-2, D130): every control renders from the server's flags
 * (`canSelfAssign`, `canAssignRecruiters`, `canSetTeamLead`); the services re-check. The dialogs live here, not under their
 * buttons, so a button that disappears after a save cannot take its own dialog (and the focus move) with it.
 */
export function TeamPanel({
  vacancy,
  preview,
  onLost,
}: {
  vacancy: VacancyDetail;
  preview: boolean;
  /** The claim went to another recruiter, so the vacancy left the viewer's scope: the host leaves it (card → list, preview → no selection). */
  onLost?: () => void;
}) {
  const t = useTranslations('vacancies.team');
  const teamLeadHeadingRef = useRef<HTMLHeadingElement>(null);
  const recruitersHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfter = useRef<FocusTarget | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [expanded, setExpanded] = useState(false);
  const Sub = preview ? 'h4' : 'h3';
  const { recruiters, teamLead, status } = vacancy;
  const closedVacancy = status === 'FILLED' || status === 'CANCELLED';
  const stepUp =
    vacancy.needsMfa && (status === 'OPEN' || status === 'ON_HOLD');
  const stepUpAssign = stepUp && !vacancy.canAssignRecruiters;
  const stepUpTeamLead = stepUp && !teamLead && !vacancy.canSetTeamLead;
  const shown = expanded ? recruiters : recruiters.slice(0, VISIBLE);

  const close = (next: TeamNext | null) => {
    const kind = dialog?.kind;
    setDialog(null);
    if (next === 'lost') onLost?.();
    else if (next)
      focusAfter.current = kind === 'teamLead' ? 'teamLead' : 'recruiters';
  };
  const closeAutoFocus = (event: Event) => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (!target) return;
    event.preventDefault();
    (target === 'teamLead'
      ? teamLeadHeadingRef
      : recruitersHeadingRef
    ).current?.focus();
  };
  const dismiss = () => setDialog(null);
  const dialogProps = { onClose: close, onCloseAutoFocus: closeAutoFocus };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Sub
          ref={teamLeadHeadingRef}
          tabIndex={-1}
          className="text-muted-foreground mb-1 text-xs font-medium focus:outline-none"
        >
          {t('teamLead')}
        </Sub>
        {teamLead ? (
          <ul>
            <PersonRow
              person={teamLead}
              caption={t(
                teamLead.isActive
                  ? 'teamLeadCaption'
                  : 'teamLeadCaptionInactive',
                { vertical: vacancy.vertical.name },
              )}
            />
          </ul>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm">{t('noTeamLead')}</p>
            {vacancy.canSetTeamLead && (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setDialog({ kind: 'teamLead' })}
              >
                {t('setTeamLead')}
              </Button>
            )}
            {stepUpTeamLead && (
              <StepUpAction>
                <Button variant="outline" className="h-11">
                  {t('setTeamLead')}
                </Button>
              </StepUpAction>
            )}
          </div>
        )}
      </div>
      <div>
        <Sub
          ref={recruitersHeadingRef}
          tabIndex={-1}
          className="text-muted-foreground mb-1 text-xs font-medium focus:outline-none"
        >
          {t('recruiters')}
        </Sub>
        {recruiters.length > 0 ? (
          <ul>
            {shown.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                caption={t(
                  person.isActive ? 'recruiterRole' : 'recruiterInactive',
                )}
                onRemove={
                  vacancy.canAssignRecruiters
                    ? () => setDialog({ kind: 'remove', recruiter: person })
                    : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            {t(closedVacancy ? 'noRecruitersClosed' : 'noRecruiters')}
          </p>
        )}
        {recruiters.length > VISIBLE && (
          <Button
            variant="ghost"
            className="min-h-11"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded
              ? t('less')
              : t('more', { count: recruiters.length - VISIBLE })}
          </Button>
        )}
        {recruiters.length === 0 &&
          (vacancy.canAssignRecruiters || vacancy.canSelfAssign) && (
            <p className="text-muted-foreground mt-1 text-sm">
              {t(status === 'ON_HOLD' ? 'holdHelper' : 'freeHelper')}
            </p>
          )}
        {(vacancy.canAssignRecruiters ||
          vacancy.canSelfAssign ||
          stepUpAssign) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {vacancy.canSelfAssign && (
              <Button
                className="h-11"
                onClick={() => setDialog({ kind: 'claim' })}
              >
                {t('claim')}
              </Button>
            )}
            {vacancy.canAssignRecruiters && (
              <Button
                variant={recruiters.length === 0 ? 'default' : 'outline'}
                className="h-11"
                onClick={() => setDialog({ kind: 'assign' })}
              >
                <UserPlus aria-hidden="true" />
                {t('assign')}
              </Button>
            )}
            {stepUpAssign && (
              <StepUpAction>
                <Button variant="outline" className="h-11">
                  <UserPlus aria-hidden="true" />
                  {t('assign')}
                </Button>
              </StepUpAction>
            )}
          </div>
        )}
      </div>
      <LazyDialog open={dialog?.kind === 'claim'} onFailed={dismiss}>
        <LazyClaimDialog vacancy={vacancy} {...dialogProps} />
      </LazyDialog>
      <LazyDialog open={dialog?.kind === 'assign'} onFailed={dismiss}>
        <AssignRecruitersDialog vacancy={vacancy} {...dialogProps} />
      </LazyDialog>
      <LazyDialog open={dialog?.kind === 'teamLead'} onFailed={dismiss}>
        <TeamLeadDialog vacancy={vacancy} {...dialogProps} />
      </LazyDialog>
      <LazyDialog open={dialog?.kind === 'remove'} onFailed={dismiss}>
        {dialog?.kind === 'remove' && (
          <RemoveRecruiterDialog
            vacancy={vacancy}
            recruiter={dialog.recruiter}
            {...dialogProps}
          />
        )}
      </LazyDialog>
    </div>
  );
}
