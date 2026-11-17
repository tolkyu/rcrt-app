'use client';

import { ExternalLink, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DetailHeader } from '@/components/ui/detail-header';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { isPrivateDraft, ownDraftActions } from '@/lib/vacancy-draft-actions';
import { toast } from '@/lib/toast';
import { DraftHeaderActions } from './draft-header-actions';
import { formatVacancyMoney } from './money';
import {
  isUrgentHighlighted,
  VacancyFlags,
  VacancyStatus,
} from './vacancy-badges';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground min-w-0 font-medium [overflow-wrap:anywhere] break-words">
        {children}
      </dd>
    </div>
  );
}

export function VacancyOverview({
  vacancy,
  preview = false,
  canAuthorDrafts = false,
}: {
  vacancy: VacancyDetail;
  preview?: boolean;
  canAuthorDrafts?: boolean;
}) {
  const t = useTranslations('vacancies');
  const [copyFailed, setCopyFailed] = useState(false);
  const [copying, setCopying] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<'header' | 'publish' | null>(null);
  // Set on the press and read after the render that flips the status, so focus never lands on a button that is about to unmount.
  const card = useMemo(
    () => ({
      removed: () => {
        focusRequest.current = 'header';
      },
      restored: () => {
        focusRequest.current = 'publish';
      },
    }),
    [],
  );
  useEffect(() => {
    const request = focusRequest.current;
    // Publish flips the status to OPEN, cancel to CANCELLED: either way the pressed action is gone.
    if (request === 'header' && vacancy.status !== 'DRAFT')
      actionsRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    else if (request === 'publish' && vacancy.status === 'DRAFT')
      publishRef.current?.focus();
    else return;
    focusRequest.current = null;
  }, [vacancy.status]);
  const privateDraft = isPrivateDraft(vacancy);
  const urgentClosed =
    vacancy.priority === 'URGENT' && !isUrgentHighlighted(vacancy);
  const note = privateDraft
    ? t(
        vacancy.status === 'CANCELLED'
          ? 'draft.privateNoteCancelled'
          : 'draft.privateNote',
      )
    : urgentClosed
      ? t('urgentClosed')
      : undefined;
  const draftPlan = ownDraftActions(vacancy, canAuthorDrafts);
  const path = `/vacancies/${vacancy.id}`;
  const Heading = preview ? 'h3' : 'h2';
  const copy = async () => {
    setCopying(true);
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).href,
      );
      toast.success(t('shareCopied'));
    } catch {
      setCopyFailed(true);
    } finally {
      setCopying(false);
    }
  };
  const absent = t('notSpecified');
  const salary = (() => {
    const currency = vacancy.salaryCurrency;
    if (!currency) return absent;
    const min = vacancy.salaryMinMinor;
    const max = vacancy.salaryMaxMinor;
    if (min !== null && max !== null)
      return min === max
        ? formatVacancyMoney(min, currency)
        : t('salaryRange', {
            min: formatVacancyMoney(min, currency),
            max: formatVacancyMoney(max, currency),
          });
    if (min !== null)
      return t('salaryFrom', { amount: formatVacancyMoney(min, currency) });
    if (max !== null)
      return t('salaryTo', { amount: formatVacancyMoney(max, currency) });
    return absent;
  })();
  const participant = (person: NonNullable<VacancyDetail['teamLead']>) => (
    <span>
      {person.fullName}
      {!person.isActive && (
        <span className="text-muted-foreground"> {t('inactive')}</span>
      )}
    </span>
  );
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 md:p-5">
      <DetailHeader
        eyebrow={vacancy.number}
        title={preview ? vacancy.title : undefined}
        badges={
          <>
            <VacancyStatus status={vacancy.status} />
            <VacancyFlags vacancy={vacancy} />
          </>
        }
        note={note}
        noteIcon={privateDraft ? 'lock' : 'info'}
        tone={isUrgentHighlighted(vacancy) ? 'urgent' : undefined}
        actionsRef={actionsRef}
        actions={
          <>
            {draftPlan && (
              <DraftHeaderActions
                vacancy={vacancy}
                plan={draftPlan}
                preview={preview}
                card={card}
                publishRef={publishRef}
              />
            )}
            {preview && draftPlan?.stage !== 'DRAFT' && (
              <Button asChild size="sm" variant="outline" className="h-11">
                <Link href={path}>
                  <ExternalLink aria-hidden="true" />
                  {t('openCard')}
                </Link>
              </Button>
            )}
            {!privateDraft && (
              <Button
                size="sm"
                variant="outline"
                className="h-11"
                onClick={() => void copy()}
                disabled={copying}
              >
                <Share2 aria-hidden="true" />
                {t('share')}
              </Button>
            )}
          </>
        }
      />
      {copyFailed && (
        <div role="alert" className="bg-surface-muted rounded-lg p-3 text-sm">
          <p>{t('shareFailed')}</p>
          <a
            href={path}
            className="text-link mt-1 inline-block min-h-11 py-2 break-all underline"
          >
            {path}
          </a>
        </div>
      )}
      {vacancy.cancelReason && (
        <section
          aria-labelledby={`vacancy-cancel-${preview ? 'preview' : 'detail'}`}
        >
          <Heading
            id={`vacancy-cancel-${preview ? 'preview' : 'detail'}`}
            className="mb-2 text-sm font-semibold"
          >
            {t('draft.cancelReasonTitle')}
          </Heading>
          <p className="text-foreground bg-surface-muted rounded-lg p-3 text-sm [overflow-wrap:anywhere] whitespace-pre-line">
            {vacancy.cancelReason}
          </p>
        </section>
      )}
      <section
        aria-labelledby={`vacancy-team-${preview ? 'preview' : 'detail'}`}
      >
        <Heading
          id={`vacancy-team-${preview ? 'preview' : 'detail'}`}
          className="mb-2 text-sm font-semibold"
        >
          {t('teamTitle')}
        </Heading>
        <dl className="divide-border divide-y">
          <Field label={t('fields.teamLead')}>
            {vacancy.teamLead ? participant(vacancy.teamLead) : t('unassigned')}
          </Field>
          <Field label={t('fields.recruiters')}>
            {vacancy.recruiters.length ? (
              <ul className="flex flex-col gap-2">
                {vacancy.recruiters.map((person) => (
                  <li key={person.id}>{participant(person)}</li>
                ))}
              </ul>
            ) : (
              t('unassigned')
            )}
          </Field>
        </dl>
      </section>
      <section
        aria-labelledby={`vacancy-terms-${preview ? 'preview' : 'detail'}`}
      >
        <Heading
          id={`vacancy-terms-${preview ? 'preview' : 'detail'}`}
          className="mb-2 text-sm font-semibold"
        >
          {t('termsTitle')}
        </Heading>
        <dl className="divide-border divide-y">
          <Field label={t('fields.vertical')}>{vacancy.vertical.name}</Field>
          <Field label={t('fields.position')}>
            {vacancy.position?.name ?? absent}
          </Field>
          <Field label={t('fields.headcount')}>
            {t('headcount', { count: vacancy.headcount })}
          </Field>
          <Field label={t('fields.seniority')}>
            {vacancy.seniority ?? absent}
          </Field>
          <Field label={t('fields.workFormat')}>
            {vacancy.workFormat
              ? t(`workFormat.${vacancy.workFormat}`)
              : absent}
          </Field>
          <Field label={t('fields.employmentType')}>
            {vacancy.employmentType ?? absent}
          </Field>
          <Field label={t('fields.location')}>
            {vacancy.location ?? absent}
          </Field>
          <Field label={t('fields.salary')}>{salary}</Field>
          <Field label={t('fields.probation')}>
            {t('probationDays', { count: vacancy.probationDays })}
          </Field>
          {vacancy.openedAt && (
            <Field label={t('fields.openedAt')}>
              {t('date', { at: new Date(vacancy.openedAt) })}
            </Field>
          )}
          <Field label={t('fields.createdAt')}>
            {t('date', { at: new Date(vacancy.createdAt) })}
          </Field>
          <Field label={t('fields.origin')}>
            {t(
              vacancy.recruiterInitiated
                ? 'recruiterInitiated'
                : 'teamLeadRequest',
            )}
          </Field>
        </dl>
      </section>
    </div>
  );
}
