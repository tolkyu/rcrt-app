'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { assignableRecruitersQuery } from '@/lib/queries/vacancy-assignable';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { VACANCY_ASSIGN_MAX } from '@/lib/schemas/vacancy-assignment';
import {
  PickerLoading,
  TeamAlert,
  TeamDialogShell,
  TeamSubmit,
} from './team-dialog-shell';
import { useAssignRecruiters } from './use-assign-recruiters';
import {
  closeWhenDone,
  useFailureText,
  type TeamDialogProps,
} from './use-team-write';

const SEARCH_FROM = 8;

/** Lazy chunk (default export): multi-select picker of eligible recruiters (wireframe §3.1). */
export default function AssignRecruitersDialog({
  vacancy,
  onClose,
  onCloseAutoFocus,
}: TeamDialogProps & { vacancy: VacancyDetail }) {
  const t = useTranslations('vacancies.team.assignDialog');
  const failureText = useFailureText();
  const tCommon = useTranslations('common');
  const query = useQuery(assignableRecruitersQuery(vacancy.id));
  const { pending, failure, assign, mountedRef } = useAssignRecruiters(vacancy);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const conditionId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const items = query.data?.items ?? [];
  const loaded = query.data !== undefined;

  useEffect(() => {
    // The list arrives after the dialog opened, so the first control takes focus then (wireframe §3.1).
    if (!loaded) return;
    const body = bodyRef.current;
    if (body && !body.contains(document.activeElement))
      body
        .querySelector<HTMLElement>('input, [role="checkbox"]:not([disabled])')
        ?.focus();
  }, [loaded]);

  // Ticks survive a refresh only for people who are still free to pick.
  const chosen = items.filter((item) => !item.assigned && picked.has(item.id));
  const full = chosen.length >= VACANCY_ASSIGN_MAX;
  const term = search.trim().toLocaleLowerCase('uk');
  const shown = term
    ? items.filter((item) =>
        item.fullName.toLocaleLowerCase('uk').includes(term),
      )
    : items;
  const toggle = (id: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const submit = () =>
    closeWhenDone(
      assign(
        chosen.map((item) => item.id),
        chosen.map((item) => item.fullName).join(', '),
      ),
      mountedRef,
      onClose,
    );

  // The picker read itself answers 409 for a vacancy closed meanwhile: same state as a closed write.
  const listClosed =
    query.error instanceof ApiError && query.error.status === 409;
  const closed = failure === 'closed' || listClosed;
  const empty = loaded && items.length === 0;
  const inline = failureText(failure, {
    closed: t('errors.closed'),
    stale: t('errors.stale'),
    invalid: t('errors.invalid'),
  });

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
              blocked={chosen.length === 0}
              pending={pending}
              describedBy={conditionId}
              onClick={submit}
            >
              {chosen.length > 0
                ? t('submitCount', { count: chosen.length })
                : t('submit')}
            </TeamSubmit>
          )}
        </>
      }
    >
      <div ref={bodyRef} className="flex min-h-0 flex-col gap-4">
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
          <TeamAlert
            onRetry={listClosed ? undefined : () => void query.refetch()}
          >
            {listClosed ? t('errors.closed') : t('loadFailed')}
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
            {items.length > SEARCH_FROM && (
              <Input
                type="search"
                value={search}
                aria-label={t('search')}
                placeholder={t('search')}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
            <ul
              aria-label={t('list', { vertical: vacancy.vertical.name })}
              className="flex max-h-80 flex-col overflow-y-auto"
            >
              {shown.map((item) => {
                const id = `assign-${item.id}`;
                const refused = !item.assigned && full && !picked.has(item.id);
                return (
                  <li key={item.id}>
                    <label
                      htmlFor={id}
                      className="flex min-h-12 items-center gap-3 rounded-md px-1"
                    >
                      <Checkbox
                        id={id}
                        checked={item.assigned || picked.has(item.id)}
                        disabled={item.assigned}
                        aria-disabled={refused || undefined}
                        onCheckedChange={(on) => {
                          if (!refused) toggle(item.id, on);
                        }}
                      />
                      <Avatar name={item.fullName} />
                      <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                        {item.fullName}
                        {!item.active && (
                          <span className="text-muted-foreground">
                            {' '}
                            {tCommon('inactive')}
                          </span>
                        )}
                        {(item.assigned || refused) && (
                          <span className="text-muted-foreground block text-xs">
                            {item.assigned
                              ? t('already')
                              : t('limit', { max: VACANCY_ASSIGN_MAX })}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="text-muted-foreground py-3 text-sm">
                  {t('searchEmpty')}
                </li>
              )}
            </ul>
            <p className="text-muted-foreground text-xs">{t('note')}</p>
            {chosen.length === 0 && (
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
