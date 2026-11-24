'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { RICH_TEXT_FIELD_HEIGHT } from '@/components/rich-text/rich-text-typography';
import { RichTextView } from '@/components/rich-text/rich-text-view';
import { EmptyState } from '@/components/states/empty-state';
import { SectionError } from '@/components/states/section-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  FormPageFooter,
  FormPageHeading,
} from '@/components/ui/form-page-frame';
import { LoadBoundary } from '@/components/ui/load-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import type { EditorDocumentResult } from '@/lib/rich-text-editor-document';
import type { VacancyContentRead } from '@/lib/schemas/vacancy-content';
import {
  CONTENT_FIELDS,
  type ContentFeedback,
  type ContentFields,
} from '@/lib/vacancy-content-form';
import { cn } from '@/lib/utils';
import { FormAlert } from './form-alert';
import {
  CONTENT_FIELD_TEXT,
  type ContentErrorCode,
} from './vacancy-content-field';

export interface ContentVacancy {
  id: string;
  number: string;
  title: string;
}
type ContentStatus = VacancyContentRead['status'];
export type BlockKey =
  | 'draft'
  | 'filled'
  | 'cancelled'
  | 'locked'
  | 'noPermission'
  | 'permissionLost';

export function blockKey(status: ContentStatus): BlockKey {
  switch (status) {
    case 'DRAFT':
      return 'draft';
    case 'FILLED':
      return 'filled';
    case 'CANCELLED':
      return 'cancelled';
    case 'OPEN':
    case 'ON_HOLD':
      return 'noPermission';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

// The API reports zod issue codes, the editor reports schema messages: both fold into the same four texts.
const ERROR_CODES = new Map<string, ContentErrorCode>([
  ['too_large', 'too_large'],
  ['too_big', 'too_large'],
  ['invalid_chars', 'invalid_chars'],
  ['invalid_link', 'invalid_link'],
]);
const toErrorCode = (code: string): ContentErrorCode =>
  ERROR_CODES.get(code) ?? 'invalid';

type EditorIssues = Extract<
  EditorDocumentResult,
  { kind: 'invalid' }
>['issues'];

/** Schema messages sit inside nested union errors, so the first known one wins. */
function issueCode(issues: EditorIssues): ContentErrorCode | null {
  for (const issue of issues) {
    const known = ERROR_CODES.get(issue.message);
    if (known) return known;
    if (issue.code === 'invalid_union') {
      const nested = issueCode(issue.errors.flat());
      if (nested) return nested;
    }
  }
  return null;
}

export function contentFieldErrors(
  fields: ContentFields,
  feedback: ContentFeedback,
) {
  const byField: Partial<
    Record<(typeof CONTENT_FIELDS)[number], ContentErrorCode>
  > = {};
  for (const field of CONTENT_FIELDS) {
    const intent = fields[field];
    if (intent.kind === 'replacement' && intent.result.kind === 'invalid')
      byField[field] = issueCode(intent.result.issues) ?? 'invalid';
  }
  let general: ContentErrorCode | null = null;
  if (feedback.kind === 'fields')
    for (const { path, code } of feedback.errors) {
      const field = CONTENT_FIELDS.find(
        (key) => path === `body.${key}` || path.startsWith(`body.${key}.`),
      );
      if (field) byField[field] ??= toErrorCode(code);
      else general ??= toErrorCode(code);
    }
  return { byField, general };
}

export function useContentHeading(vacancy: ContentVacancy | null) {
  const t = useTranslations('vacancies.contentEdit');
  return {
    title: t('title'),
    subtitle: vacancy
      ? t('subtitle', { number: vacancy.number, title: vacancy.title })
      : undefined,
    back: {
      href: vacancy ? `/vacancies/${vacancy.id}` : '/vacancies',
      label: t('back'),
    },
  };
}

/** Wireframe 720 px column for this page only; below md it stays full width so the sticky footer's negative margins still reach the screen edges. */
export function ContentFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full md:max-w-[720px] [&_h1+p]:[overflow-wrap:anywhere]">
      {children}
    </div>
  );
}

/** Loading twin of the form: same heading, label rows, editor box and clear row, so nothing moves when the editors arrive. */
export function ContentSkeleton({
  vacancy,
}: {
  vacancy: ContentVacancy | null;
}) {
  const t = useTranslations('states');
  const heading = useContentHeading(vacancy);
  return (
    <ContentFrame>
      <FormPageHeading {...heading} />
      <div
        role="status"
        data-slot="form-skeleton"
        className="skeleton-delayed flex flex-col gap-6"
      >
        <span className="sr-only">{t('loading')}</span>
        {CONTENT_FIELDS.map((field) => (
          <div key={field} aria-hidden="true" className="flex flex-col">
            <div className="mb-1.5 flex h-5 items-center">
              <Skeleton className="h-3.5 w-32" />
            </div>
            <Skeleton className={cn('rounded-lg', RICH_TEXT_FIELD_HEIGHT)} />
            <div className="mt-2 h-11 md:h-8" />
          </div>
        ))}
        <FormPageFooter>
          <Skeleton className="h-11 min-w-[6.16rem] rounded-lg md:h-10" />
          <Skeleton className="h-11 min-w-[9.5rem] rounded-lg md:h-10" />
        </FormPageFooter>
      </div>
    </ContentFrame>
  );
}

const VACANCY_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** The read failed, so only the static title and the id already in the URL are shown: no number or title, and the same output whether or not the vacancy exists. */
export function ContentReadError({
  vacancyId,
  retrying,
  onRetry,
}: {
  vacancyId: string;
  retrying?: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('vacancies.contentEdit');
  const back = VACANCY_ID.test(vacancyId)
    ? { href: `/vacancies/${vacancyId.toLowerCase()}`, label: t('back') }
    : { href: '/vacancies', label: t('toList') };
  return (
    <ContentFrame>
      <FormPageHeading title={t('title')} back={back} />
      <Card>
        <SectionError retrying={retrying} onRetry={onRetry} />
      </Card>
    </ContentFrame>
  );
}

export function ContentLoadRetry({ vacancyId }: { vacancyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ContentReadError
      vacancyId={vacancyId}
      retrying={pending}
      onRetry={() => startTransition(() => router.refresh())}
    />
  );
}

export function ContentUnavailable() {
  const t = useTranslations('vacancies.contentEdit');
  return (
    <Card>
      <EmptyState
        icon={SearchX}
        title={t('unavailableTitle')}
        description={t('unavailableDescription')}
        action={
          <Link
            href="/vacancies"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('toList')}
          </Link>
        }
      />
    </Card>
  );
}

export function ContentBlock({ id, reason }: { id: string; reason: BlockKey }) {
  const t = useTranslations('vacancies.contentEdit');
  const draft = reason === 'draft';
  return (
    <FormAlert
      tone="warning"
      action={
        <Link
          href={draft ? `/vacancies/${id}/edit` : `/vacancies/${id}`}
          className="inline-flex min-h-11 items-center underline md:min-h-0"
        >
          {t(draft ? 'draftLink' : 'back')}
        </Link>
      }
    >
      {t(reason)}
    </FormAlert>
  );
}

/** Readable but not editable (or an own draft): the reason, the way back and the documents; never an editor. */
export function ContentReadOnly({
  vacancy,
  content,
}: {
  vacancy: ContentVacancy;
  content: VacancyContentRead;
}) {
  const t = useTranslations('vacancies.contentEdit');
  const heading = useContentHeading(vacancy);
  const reason = blockKey(content.status);
  return (
    <ContentFrame>
      <FormPageHeading {...heading} />
      <div className="flex flex-col gap-6">
        <ContentBlock id={vacancy.id} reason={reason} />
        {reason !== 'draft' &&
          CONTENT_FIELDS.map((field) => (
            <section key={field}>
              <h2 className="text-foreground mb-2 text-sm font-medium">
                {t(CONTENT_FIELD_TEXT[field].label)}
              </h2>
              {content[field] ? (
                <RichTextView document={content[field]} headingOffset={2} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t(CONTENT_FIELD_TEXT[field].empty)}
                </p>
              )}
            </section>
          ))}
      </div>
    </ContentFrame>
  );
}

const ConfirmDialog = lazy(() =>
  import('@/components/ui/confirm-dialog').then((module) => ({
    default: module.ConfirmDialog,
  })),
);

/** Fallback when the dialog chunk is gone (a tab older than the last deploy): the browser's own question still guards the typed edits. */
function NativeReloadQuestion({
  question,
  onAnswer,
}: {
  question: string;
  onAnswer: (reload: boolean) => void;
}) {
  const answered = useRef(false);
  useEffect(() => {
    if (answered.current) return;
    answered.current = true;
    onAnswer(window.confirm(question));
  }, [question, onAnswer]);
  return null;
}

function StaleAlert({
  dirty,
  busy,
  onReload,
}: {
  dirty: boolean;
  busy: boolean;
  onReload: () => void;
}) {
  const t = useTranslations('vacancies.contentEdit');
  const [asking, setAsking] = useState(false);
  const [opened, setOpened] = useState(false);
  const answer = (reload: boolean) => {
    setAsking(false);
    if (reload) onReload();
  };
  return (
    <>
      <FormAlert
        tone="warning"
        action={
          <Button
            variant="outline"
            className="h-11 max-sm:w-full md:h-10"
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return;
              if (dirty) {
                setOpened(true);
                setAsking(true);
              } else onReload();
            }}
          >
            {t('reload')}
          </Button>
        }
      >
        {t('stale')}
      </FormAlert>
      {opened && (
        <LoadBoundary
          fallback={
            asking && (
              <NativeReloadQuestion
                question={t('reloadTitle')}
                onAnswer={answer}
              />
            )
          }
        >
          <Suspense fallback={null}>
            <ConfirmDialog
              open={asking}
              onOpenChange={setAsking}
              tone="destructive"
              title={t('reloadTitle')}
              description={t('reloadDescription')}
              confirmLabel={t('reloadConfirm')}
              cancelLabel={t('reloadStay')}
              onConfirm={() => answer(true)}
            />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  );
}

const FAILURE_KINDS = [
  'network',
  'server',
  'loadFailed',
  'rateLimited',
  'reloadFailed',
] as const;
const failureOf = (kind: ContentFeedback['kind']) =>
  FAILURE_KINDS.find((failure) => failure === kind);

/** Save outcomes shown above the fields; `fields` is excluded because the invalid editor takes focus instead. */
export const isSaveAlert = (kind: ContentFeedback['kind']) =>
  kind === 'stale' ||
  kind === 'closed' ||
  kind === 'forbidden' ||
  failureOf(kind) !== undefined;

export function ContentAlerts({
  vacancyId,
  feedback,
  general,
  block,
  stale,
  dirty,
  busy,
  checkFailed,
  onReload,
  onRetry,
  onRecheck,
}: {
  vacancyId: string;
  feedback: ContentFeedback;
  general: ContentErrorCode | null;
  block: BlockKey | null;
  stale: boolean;
  dirty: boolean;
  busy: boolean;
  checkFailed: boolean;
  onReload: () => void;
  onRetry: () => void;
  onRecheck: () => void;
}) {
  const t = useTranslations('vacancies.contentEdit');
  const tCommon = useTranslations('common');
  const failure = failureOf(feedback.kind);
  const retry = (action: () => void) => (
    <Button
      variant="outline"
      className="h-11 max-sm:w-full md:h-10"
      onClick={action}
    >
      {tCommon('retry')}
    </Button>
  );
  return (
    <>
      {block && <ContentBlock id={vacancyId} reason={block} />}
      {stale && !block && (
        <StaleAlert dirty={dirty} busy={busy} onReload={onReload} />
      )}
      {failure && (
        <FormAlert
          action={
            failure === 'rateLimited' || failure === 'reloadFailed'
              ? undefined
              : retry(onRetry)
          }
        >
          {t(`feedback.${failure}`)}
        </FormAlert>
      )}
      {general && <FormAlert>{t(`errors.${general}`)}</FormAlert>}
      {checkFailed && (
        <FormAlert action={retry(onRecheck)}>{t('checkFailed')}</FormAlert>
      )}
    </>
  );
}
