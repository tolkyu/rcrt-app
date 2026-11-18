'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { assignableTeamLeadsQuery } from '@/lib/queries/team-leads';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import {
  PickerLoading,
  TeamAlert,
  TeamDialogShell,
  TeamSubmit,
} from './team-dialog-shell';
import { useSetTeamLead } from './use-set-team-lead';
import {
  closeWhenDone,
  useFailureText,
  type TeamDialogProps,
} from './use-team-write';

/** Lazy chunk (default export): one-time Team Lead choice, no preselection (wireframe §3.4). */
export default function TeamLeadDialog({
  vacancy,
  onClose,
  onCloseAutoFocus,
}: TeamDialogProps & { vacancy: VacancyDetail }) {
  const t = useTranslations('vacancies.team.teamLeadDialog');
  const failureText = useFailureText();
  const verticalId = vacancy.vertical.id;
  // The form shares this list with a 60 s cache; a one-time choice must not show a Team Lead who lost the role a minute ago.
  const query = useQuery({
    ...assignableTeamLeadsQuery(verticalId),
    refetchOnMount: 'always',
  });
  const { pending, failure, set, mountedRef } = useSetTeamLead(vacancy);
  const [choice, setChoice] = useState('');
  const conditionId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const items = query.data?.items ?? [];
  const loaded = query.data !== undefined;
  const chosen = items.find((item) => item.id === choice);

  useEffect(() => {
    if (!loaded) return;
    const body = bodyRef.current;
    if (body && !body.contains(document.activeElement))
      body.querySelector<HTMLElement>('[role="radio"]')?.focus();
  }, [loaded]);

  const submit = () => {
    if (chosen) closeWhenDone(set(chosen), mountedRef, onClose);
  };
  const closed = failure === 'closed';
  const empty = loaded && items.length === 0;
  const inline = failureText(
    failure,
    {
      closed: t('errors.closed'),
      stale: t('errors.stale'),
      invalid: t('errors.invalid'),
    },
    ['teamLeadSet'],
  );

  return (
    <TeamDialogShell
      title={t('title')}
      vacancy={vacancy}
      pending={pending}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onClose(null)}
            disabled={pending}
          >
            {closed || empty ? t('close') : t('cancel')}
          </Button>
          {!closed && !empty && (
            <TeamSubmit
              blocked={!chosen}
              pending={pending}
              describedBy={conditionId}
              onClick={submit}
            >
              {t('submit')}
            </TeamSubmit>
          )}
        </>
      }
    >
      <div ref={bodyRef} className="flex min-h-0 flex-col gap-4">
        <p className="text-muted-foreground text-sm">{t('note')}</p>
        {inline && (
          <TeamAlert
            onRetry={
              failure === 'network' || failure === 'failed' ? submit : undefined
            }
          >
            {inline}
          </TeamAlert>
        )}
        {query.isError && (
          <TeamAlert onRetry={() => void query.refetch()}>
            {t('loadFailed')}
          </TeamAlert>
        )}
        {query.isPending && <PickerLoading label={t('loading')} />}
        {empty && (
          <div className="flex flex-col gap-1">
            <p className="text-foreground text-sm font-semibold">
              {t('emptyTitle')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('emptyDescription')}
            </p>
          </div>
        )}
        {loaded && items.length > 0 && !closed && (
          <>
            <RadioGroup
              aria-label={t('list', { vertical: vacancy.vertical.name })}
              value={choice}
              onValueChange={setChoice}
              disabled={pending}
            >
              {items.map((item) => (
                <RadioGroupItem
                  key={item.id}
                  id={`team-lead-${item.id}`}
                  value={item.id}
                  label={
                    <span className="flex items-center gap-3 [overflow-wrap:anywhere]">
                      <Avatar name={item.fullName} />
                      {item.fullName}
                      {item.priority !== null && (
                        <span className="text-muted-foreground">
                          {t('priority', { priority: item.priority })}
                        </span>
                      )}
                    </span>
                  }
                />
              ))}
            </RadioGroup>
            {!chosen && (
              <p
                id={conditionId}
                className="text-muted-foreground-strong text-xs"
              >
                {t('condition')}
              </p>
            )}
          </>
        )}
      </div>
    </TeamDialogShell>
  );
}
