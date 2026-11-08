'use client';

import { ExternalLink, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { VacancyDetail } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { formatVacancyMoney } from './money';
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

export function VacancyOverview({
  vacancy,
  preview = false,
}: {
  vacancy: VacancyDetail;
  preview?: boolean;
}) {
  const t = useTranslations('vacancies');
  const [copyFailed, setCopyFailed] = useState(false);
  const [copying, setCopying] = useState(false);
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
      <div className="min-w-0">
        <p className="text-muted-foreground mb-2 text-xs font-medium tabular-nums">
          {vacancy.number}
        </p>
        {preview && (
          <h2 className="text-heading-lg mb-3 [overflow-wrap:anywhere] break-words">
            {vacancy.title}
          </h2>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <VacancyStatus status={vacancy.status} />
          <VacancyFlags vacancy={vacancy} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {preview && (
          <Button asChild size="sm" variant="outline" className="h-11">
            <Link href={path}>
              <ExternalLink aria-hidden="true" />
              {t('openCard')}
            </Link>
          </Button>
        )}
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
      </div>
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
