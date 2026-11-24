'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { focusField } from '@/components/vacancies/use-field-summary';
import { useSubmitLifecycle } from '@/components/vacancies/use-submit-lifecycle';
import type { CreateVacancyBody, VacancyDetail } from '@/lib/schemas/vacancy';
import { vacancyFormValues } from '@/lib/vacancy-edit-form';
import {
  loadEditFeedback,
  loadEditSubmit,
  type EditFeedbackModule,
  type EditModule,
} from '@/lib/vacancy-edit-load';
import type { EditFinalFailure } from '@/lib/vacancy-edit-submit';
import {
  type FilledField,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';

/** A patch has no null for headcount or probation, so a blank one is a required-field error (never a silent keep). */
export const FILLED_FIELDS: readonly FilledField[] = ['headcount'];
export const FILLED_FIELDS_WITH_PROBATION: readonly FilledField[] = [
  'headcount',
  'probationDays',
];

/**
 * Send pipeline of the edit form: the shared press lifecycle, then the diff (PATCH, then publish), every answer mapped to the form.
 * The heavy parts live in the lazy module, so this hook stays small in the page chunk (PERF-04).
 */
export function useEditVacancy({
  form: { handleSubmit, setError, subscribe, reset },
  modeRef,
  guard,
  vacancy,
  shown,
}: {
  form: Pick<
    UseFormReturn<VacancyFormValues>,
    'handleSubmit' | 'setError' | 'subscribe' | 'reset'
  >;
  modeRef: RefObject<VacancyFormMode>;
  guard: RefObject<LeaveGuardHandle | null>;
  vacancy: VacancyDetail;
  shown: { readonly teamLead: boolean; readonly probation: boolean };
}) {
  const t = useTranslations('vacancyForm');
  const tEdit = useTranslations('vacancyForm.edit');
  const router = useRouter();
  const queryClient = useQueryClient();
  const attempts = useRef<ReturnType<EditModule['createAttemptKeys']> | null>(
    null,
  );
  // The draft as the server last stored it: the version every send is checked against. A ref, so a retry never reads an older render.
  const stored = useRef(vacancy);
  const [baseline, setBaseline] = useState(vacancy);
  const [staleUi, setStaleUi] = useState<EditFeedbackModule | null>(null);
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);
  const life = useSubmitLifecycle({
    form: { handleSubmit, subscribe },
    modeRef,
    loadLib: loadEditSubmit,
    filled: shown.probation ? FILLED_FIELDS_WITH_PROBATION : FILLED_FIELDS,
  });
  const {
    mounted,
    tryLock,
    unlock,
    ifMounted,
    speakOffline,
    setPendingMode,
    invalidFields,
    focusFirstInvalid,
    clearSummary,
  } = life;

  /** Makes `next` the stored draft and puts its values in the form (nothing typed is left to lose by then). */
  const adopt = (next: VacancyDetail) => {
    stored.current = next;
    setBaseline(next);
    reset(vacancyFormValues(next, shown.probation));
  };

  /** `retry` repeats the action that failed (a save or a reload), so a toast button never runs another one. */
  const showFailure = (
    lib: EditModule,
    effect: EditFinalFailure,
    retry: () => void,
    publishRefused = false,
  ) =>
    lib.showEditFailure(
      {
        queryClient,
        t,
        tEdit,
        setError,
        invalidFields,
        focusFirstInvalid,
        id: stored.current.id,
        router,
        setStale,
        loadStaleUi: () =>
          void loadEditFeedback().then(
            (loaded) => mounted.current && setStaleUi(loaded),
            () => undefined,
          ),
        release: () => guard.current?.release(),
      },
      effect,
      retry,
      publishRefused,
    );

  const send = async (
    lib: EditModule,
    values: VacancyFormValues,
    body: CreateVacancyBody,
    action: VacancyFormMode,
  ) => {
    const current = stored.current;
    const plan = lib.buildPatch(
      vacancyFormValues(current, shown.probation),
      values,
      body,
      shown,
    );
    if (!plan.ok) {
      // The form already insists on these fields; this keeps a state without a patch from ever being dropped.
      unlock();
      showFailure(
        lib,
        { type: 'fields', errors: plan.errors },
        () => undefined,
      );
      return;
    }
    setStale(false);
    setPendingMode(action);
    attempts.current ??= lib.createAttemptKeys();
    const outcome = await lib.submitEdit(queryClient, attempts.current, {
      id: current.id,
      version: current.version,
      action,
      changes: plan.changes,
      everything: plan.everything,
      hasSalaryAmount:
        values.salaryMin.trim() !== '' || values.salaryMax.trim() !== '',
    });
    if (outcome.status === 'failed') {
      unlock();
      if (!mounted.current) return;
      // The PATCH worked and the publish did not: the draft is saved, so the form is clean again.
      if (outcome.saved) adopt(outcome.saved);
      showFailure(
        lib,
        outcome.effect,
        ifMounted(() => submit(action)),
        outcome.stage === 'publish',
      );
      return;
    }
    // A success stays locked until the page unmounts: a press during the navigation must not send a second request.
    if (!mounted.current) return;
    const href = outcome.vacancy
      ? lib.announceEdited(t, action, outcome.vacancy)
      : lib.vacancyDraftLandingHref(current.vertical.id, current.id);
    guard.current?.release();
    router.replace(href);
  };

  const submit = (action: VacancyFormMode) =>
    life.submit(action, (lib, values, body) => send(lib, values, body, action));

  /** «Завантажити актуальну»: replaces the form with the stored draft; a stored draft that is no longer one leaves the form. */
  const reloadLatest = async () => {
    if (!tryLock()) return;
    setReloading(true);
    const retry = ifMounted(() => void reloadLatest());
    try {
      const lib = await loadEditSubmit();
      try {
        const latest = await lib.loadLatestVacancy(
          queryClient,
          stored.current.id,
        );
        if (!mounted.current) return;
        if (latest.status === 'DRAFT') {
          adopt(latest);
          setStale(false);
          clearSummary();
          // The alert and its button are gone: focus goes back into the form instead of to the page.
          focusField('title');
        } else showFailure(lib, { type: 'notDraft' }, retry);
      } catch (error) {
        if (mounted.current)
          showFailure(lib, lib.planEditFailure(error, true), retry);
      }
    } catch {
      speakOffline(() => void reloadLatest());
    } finally {
      unlock();
      if (mounted.current) setReloading(false);
    }
  };

  return {
    submit,
    reloadLatest,
    pendingMode: life.pendingMode,
    pending: life.pendingMode !== null || reloading,
    reloading,
    lib: life.lib,
    feedback: life.feedback,
    staleUi,
    stale,
    summary: life.summary,
    announce: life.announce,
    baseline,
  };
}
