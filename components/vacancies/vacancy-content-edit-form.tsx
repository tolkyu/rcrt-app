'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import type { VacancyContent } from '@/lib/schemas/vacancy-content';
import {
  CONTENT_FIELDS,
  isEditableStatus,
  type ContentFields,
} from '@/lib/vacancy-content-form';
import { useEditVacancyContent } from './use-edit-vacancy-content';
import { useVacancyContentAccess } from './use-vacancy-content-access';
import {
  CONTENT_FIELD_IDS,
  CONTENT_FIELD_TEXT,
  VacancyContentField,
} from './vacancy-content-field';
import {
  ContentAlerts,
  ContentCheckRetry,
  ContentReadOnly,
  ContentSkeleton,
  ContentUnavailable,
  blockKey,
  contentFieldErrors,
  useContentHeading,
  type BlockKey,
  type ContentVacancy,
} from './vacancy-content-feedback';

type Edit = ReturnType<typeof useEditVacancyContent>;
type Read = ReturnType<typeof useVacancyContentAccess>['state'];

function ContentEditor({
  vacancy,
  edit,
  baseline,
  fields,
  block,
  checkFailed,
  onRecheck,
}: {
  vacancy: ContentVacancy;
  edit: Edit;
  baseline: VacancyContent;
  fields: ContentFields;
  block: BlockKey | null;
  checkFailed: boolean;
  onRecheck: () => void;
}) {
  const t = useTranslations('vacancies.contentEdit');
  const heading = useContentHeading(vacancy);
  const guardRef = useRef<LeaveGuardHandle>(null);
  useLayoutEffect(() => {
    const guard = guardRef.current;
    // ADR-020: forced teardown must not pop history and cancel session navigation.
    return () => guard?.release();
  }, []);
  const latest = useRef(edit);
  useLayoutEffect(() => {
    latest.current = edit;
  });
  // Stable handlers: the editors keep the callbacks of the render that created them.
  const onChange = useCallback<Edit['change']>(
    (field, result) => latest.current.change(field, result),
    [],
  );
  const onReady = useCallback<Edit['setReady']>(
    (field, ready) => latest.current.setReady(field, ready),
    [],
  );
  const onClear = useCallback<Edit['clear']>(
    (field) => latest.current.clear(field),
    [],
  );
  const onUndoClear = useCallback<Edit['undoClear']>(
    (field) => latest.current.undoClear(field),
    [],
  );
  const save = () => {
    edit.submit().catch(() => undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key !== 'Enter' ||
      !(event.ctrlKey || event.metaKey) ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    save();
  };

  const { byField, general } = contentFieldErrors(fields, edit.feedback);
  const failed =
    edit.feedback.kind === 'fields'
      ? CONTENT_FIELDS.filter((field) => byField[field])
      : [];
  const firstFailed = failed[0];
  const [attempts, setAttempts] = useState({
    feedback: edit.feedback,
    count: 0,
  });
  if (attempts.feedback !== edit.feedback)
    setAttempts({ feedback: edit.feedback, count: attempts.count + 1 });
  useEffect(() => {
    if (firstFailed)
      document.getElementById(CONTENT_FIELD_IDS[firstFailed])?.focus();
  }, [edit.feedback, firstFailed]);

  const status = edit.pending
    ? t('saving')
    : edit.feedback.kind === 'saved'
      ? t('saved')
      : edit.feedback.kind === 'noOp'
        ? t('unchanged')
        : '';
  return (
    <FormPageLayout
      {...heading}
      guardRef={guardRef}
      dirty={edit.protectLeave}
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
      footer={
        <>
          {edit.pending ? (
            <Button variant="outline" aria-disabled className="h-11 md:h-10">
              {t('cancel')}
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-11 md:h-10">
              <Link href={heading.back.href}>{t('cancel')}</Link>
            </Button>
          )}
          <Button
            aria-busy={edit.pending || undefined}
            aria-disabled={!edit.canSave || undefined}
            className="h-11 min-w-[9.5rem] md:h-10"
            onClick={save}
          >
            {edit.pending ? t('saving') : t('save')}
          </Button>
        </>
      }
    >
      <ContentAlerts
        vacancyId={vacancy.id}
        feedback={edit.feedback}
        general={general}
        block={block}
        stale={edit.stale}
        dirty={edit.dirty}
        busy={edit.pending || edit.reloading}
        checkFailed={checkFailed}
        onReload={() => {
          edit.reloadConfirmed().catch(() => undefined);
        }}
        onRetry={save}
        onRecheck={onRecheck}
      />
      <FormError
        count={failed.length}
        attempt={attempts.count}
        links={failed.map((field) => ({
          id: CONTENT_FIELD_IDS[field],
          label: t(CONTENT_FIELD_TEXT[field].label),
        }))}
      />
      {CONTENT_FIELDS.map((field) => (
        <VacancyContentField
          key={field}
          field={field}
          baseline={baseline[field]}
          intent={fields[field]}
          resetKey={edit.resetKeys[field]}
          disabled={edit.disabled}
          errorCode={byField[field]}
          onChange={onChange}
          onReady={onReady}
          onClear={onClear}
          onUndoClear={onUndoClear}
        />
      ))}
      <div
        role="status"
        className={
          edit.pending
            ? 'sr-only'
            : 'text-success-text text-sm font-medium empty:hidden'
        }
      >
        {status}
      </div>
    </FormPageLayout>
  );
}

function blockFor(
  edit: Edit,
  read: Extract<Read, { kind: 'readable' }> | null,
) {
  if (read && !isEditableStatus(read.content.status))
    return blockKey(read.content.status);
  if (edit.closed) return 'locked';
  if (
    (read && !read.content.canEditContent) ||
    edit.feedback.kind === 'forbidden'
  )
    return 'permissionLost';
  return null;
}

/** Published-content editor (VAC-08, ADR-020): picks locked / read-only / skeleton / form from the one access observer; editors mount only after a fresh read proves eligibility and stay mounted when it later fails, so typed text survives. */
export function VacancyContentEditForm({
  vacancy,
}: {
  vacancy: ContentVacancy;
}) {
  const access = useVacancyContentAccess(vacancy.id);
  const edit = useEditVacancyContent({ id: vacancy.id, access });
  const [engaged, setEngaged] = useState(false);
  const { state } = access;
  const read = state.kind === 'readable' ? state : null;
  const checking = state.kind === 'checking' ? state : null;
  const eligible =
    !!read &&
    read.content.canEditContent &&
    isEditableStatus(read.content.status);
  if (eligible && !engaged) setEngaged(true);
  const recheck = () => {
    access.revalidate().catch(() => undefined);
  };

  if (state.kind === 'unavailable')
    return state.reason === 'notFound' ? (
      <ContentUnavailable />
    ) : (
      <ContentSkeleton vacancy={vacancy} />
    );
  if (engaged || eligible)
    return edit.baseline && edit.fields ? (
      <ContentEditor
        vacancy={vacancy}
        edit={edit}
        baseline={edit.baseline}
        fields={edit.fields}
        block={blockFor(edit, read)}
        checkFailed={!!checking?.error}
        onRecheck={recheck}
      />
    ) : (
      <ContentSkeleton vacancy={vacancy} />
    );
  if (read) return <ContentReadOnly vacancy={vacancy} content={read.content} />;
  return checking?.error ? (
    <ContentCheckRetry onRetry={recheck} />
  ) : (
    <ContentSkeleton vacancy={vacancy} />
  );
}
