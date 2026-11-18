'use client';

import { ExternalLink, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { DetailHeader } from '@/components/ui/detail-header';
import { Input } from '@/components/ui/input';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { isPrivateDraft, ownDraftActions } from '@/lib/vacancy-draft-actions';
import { toast } from '@/lib/toast';
import { DraftHeaderActions } from './draft-header-actions';
import { formatVacancyMoney } from './money';
import { isUrgentHighlighted } from '@/lib/vacancy-urgency';
import { StatusBanner, useStatusNote } from './status-banner';
import { StatusHeaderActions } from './status-header-actions';
import { TeamPanel } from './team-panel';
import { UrgencySection } from './urgency-section';
import { VacancyFlags, VacancyStatus } from './vacancy-badges';

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

export function VacancyOverview(
  props: ComponentProps<typeof VacancyOverviewContent>,
) {
  return <VacancyOverviewContent key={props.vacancy.id} {...props} />;
}

function VacancyOverviewContent({
  vacancy,
  preview = false,
  canAuthorDrafts = false,
  onClaimLost,
}: {
  vacancy: VacancyDetail;
  preview?: boolean;
  canAuthorDrafts?: boolean;
  onClaimLost?: () => void;
}) {
  const t = useTranslations('vacancies');
  const common = useTranslations('common');
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const copyPending = useRef(false);
  const mounted = useRef(false);
  const shareRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
  const teamHeadingRef = useRef<HTMLHeadingElement>(null);
  const urgencyRemoved = useRef(false);
  const markUrgencyRemoved = useCallback(() => {
    urgencyRemoved.current = true;
  }, []);
  useEffect(() => {
    // The section left with the focus inside (the vacancy closed under the user): the next heading takes it, never <body>.
    if (vacancy.canChangeUrgency || !urgencyRemoved.current) return;
    urgencyRemoved.current = false;
    teamHeadingRef.current?.focus();
  }, [vacancy.canChangeUrgency]);
  const holdNote = useStatusNote(vacancy);
  const privateDraft = isPrivateDraft(vacancy);
  const highlighted = isUrgentHighlighted(vacancy);
  const urgentClosed = vacancy.priority === 'URGENT' && !highlighted;
  const note = privateDraft
    ? t(
        vacancy.status === 'CANCELLED'
          ? 'draft.privateNoteCancelled'
          : 'draft.privateNote',
      )
    : [holdNote, urgentClosed ? t('urgentClosed') : undefined]
        .filter(Boolean)
        .join(' ') || undefined;
  const draftPlan = ownDraftActions(vacancy, canAuthorDrafts);
  const path = `/vacancies/${vacancy.id}`;
  const Heading = preview ? 'h3' : 'h2';
  const copy = async () => {
    if (copyPending.current) return;
    copyPending.current = true;
    setCopying(true);
    setFailedUrl(null);
    const url = new URL(path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      if (mounted.current) toast.success(t('shareCopied'));
    } catch {
      if (mounted.current) setFailedUrl(url);
    } finally {
      copyPending.current = false;
      if (mounted.current) setCopying(false);
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
        tone={highlighted ? 'urgent' : undefined}
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
                ref={shareRef}
                size="sm"
                variant="outline"
                className="h-11"
                onClick={() => void copy()}
                aria-disabled={copying}
              >
                <Share2 aria-hidden="true" />
                {t('share')}
              </Button>
            )}
            {!privateDraft && (
              <StatusHeaderActions
                key={vacancy.id}
                vacancy={vacancy}
                preview={preview}
              />
            )}
          </>
        }
      />
      {!privateDraft && <StatusBanner vacancy={vacancy} />}
      {failedUrl && !privateDraft && (
        <div
          role="alert"
          className="border-warning/30 bg-warning-subtle rounded-lg border p-3 text-sm"
        >
          <p>{t('shareFailed')}</p>
          <Input
            className="mt-2 text-base md:text-base"
            aria-label={t('shareLinkLabel')}
            readOnly
            value={failedUrl}
            ref={(input) => {
              if (!input) return;
              const focused = document.activeElement;
              input.select();
              if (focused instanceof HTMLElement)
                focused.focus({ preventScroll: true });
            }}
          />
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setFailedUrl(null);
              shareRef.current?.focus();
            }}
          >
            {common('close')}
          </Button>
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
      {vacancy.canChangeUrgency && (
        <UrgencySection
          key={vacancy.id}
          vacancy={vacancy}
          preview={preview}
          Heading={preview ? 'h3' : 'h2'}
          onRemoved={markUrgencyRemoved}
        />
      )}
      <section
        aria-labelledby={`vacancy-team-${preview ? 'preview' : 'detail'}`}
      >
        <Heading
          ref={teamHeadingRef}
          tabIndex={-1}
          id={`vacancy-team-${preview ? 'preview' : 'detail'}`}
          className="mb-2 text-sm font-semibold focus:outline-none"
        >
          {t('teamTitle')}
        </Heading>
        <TeamPanel
          key={vacancy.id}
          vacancy={vacancy}
          preview={preview}
          onLost={onClaimLost}
        />
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
