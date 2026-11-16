'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import {
  VACANCY_FIELD_IDS,
  VACANCY_FORM_FIELDS,
  type VacancyFormField,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import {
  loadFeedback,
  loadSubmit,
  type FeedbackModule,
  type SubmitModule,
} from '@/lib/vacancy-form-load';
import type { FinalFailure } from '@/lib/vacancy-form-submit';
import type { CreateVacancyBody } from '@/lib/schemas/vacancy';

export type CreateAlert = 'draftLimit' | 'verticalUnavailable' | null;

/**
 * Submit pipeline of the create form: validate for the pressed action, send once with one idempotency key per attempt,
 * map every answer to the form. The heavy parts live in the lazy module, so this hook stays small in the page chunk (PERF-04).
 */
export function useCreateVacancy({
  form: { handleSubmit, setError, subscribe },
  modeRef,
  guard,
}: {
  form: Pick<
    UseFormReturn<VacancyFormValues>,
    'handleSubmit' | 'setError' | 'subscribe'
  >;
  modeRef: RefObject<VacancyFormMode>;
  guard: RefObject<LeaveGuardHandle | null>;
}) {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  const router = useRouter();
  const queryClient = useQueryClient();
  const attempts = useRef<ReturnType<SubmitModule['createAttemptKeys']> | null>(
    null,
  );
  const mounted = useRef(true);
  // Set synchronously on the first press (state would only update after the render); released only when the attempt fails.
  const busy = useRef(false);
  // The inline pieces (spinner, alerts, link) load on mount like the submit module; until they have, an alert reaches the user as a toast.
  const [lib, setLib] = useState<SubmitModule | null>(null);
  const [feedback, setFeedback] = useState<FeedbackModule | null>(null);
  const [pendingMode, setPendingMode] = useState<VacancyFormMode | null>(null);
  const [alert, setAlert] = useState<CreateAlert>(null);
  const [summary, setSummary] = useState({ count: 0, attempt: 0 });
  const [announce, setAnnounce] = useState(true);

  useEffect(() => {
    mounted.current = true;
    loadSubmit().then(
      (loaded) => mounted.current && setLib(loaded),
      () => undefined,
    );
    loadFeedback().then(
      (loaded) => mounted.current && setFeedback(loaded),
      () => undefined,
    );
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ type }) => {
          if (type === 'change') setAnnounce(true);
        },
      }),
    [subscribe],
  );

  const unlock = () => {
    busy.current = false;
    setPendingMode(null);
  };

  const invalidFields = (invalid: readonly string[]) => {
    setAnnounce(false);
    setSummary((current) => ({
      count: invalid.length,
      attempt: current.attempt + 1,
    }));
    const first = VACANCY_FORM_FIELDS.find((field) => invalid.includes(field));
    if (first) document.getElementById(VACANCY_FIELD_IDS[first])?.focus();
  };

  const retryAction = (action: VacancyFormMode) => ({
    label: t('toast.retry'),
    onAction: () => {
      if (mounted.current) submit(action);
    },
  });

  const showFailure = (
    lib: SubmitModule,
    effect: FinalFailure,
    action: VacancyFormMode,
  ) => {
    if (effect.type === 'fields') {
      for (const [field, code] of Object.entries(effect.errors))
        setError(field as VacancyFormField, { type: 'server', message: code });
      if (effect.errors.positionId === 'positionInactive')
        void queryClient.invalidateQueries({ queryKey: ['positions'] });
      invalidFields(Object.keys(effect.errors));
    } else if (effect.type === 'alert') {
      if (feedback) setAlert(effect.alert);
      else lib.showAlertToast(t, tVacancies, effect.alert);
      if (effect.alert === 'verticalUnavailable') router.refresh();
    } else {
      lib.showFailureToast(t, effect, retryAction(action).onAction);
    }
  };

  const send = async (lib: SubmitModule, body: CreateVacancyBody) => {
    setAlert(null);
    setPendingMode(body.mode);
    attempts.current ??= lib.createAttemptKeys();
    const outcome = await lib.submitCreate(queryClient, attempts.current, body);
    if (outcome.status === 'failed') {
      unlock();
      if (mounted.current) showFailure(lib, outcome.effect, body.mode);
      return;
    }
    // A success stays locked until the page unmounts: a press during the navigation must not create a second vacancy.
    if (!mounted.current) return;
    const href = lib.announceCreated(t, body, outcome.created);
    guard.current?.release();
    router.replace(href);
  };

  const submit = (action: VacancyFormMode) => {
    if (busy.current) return;
    busy.current = true;
    modeRef.current = action;
    handleSubmit(
      async (values) => {
        setSummary((current) => ({ ...current, count: 0 }));
        const lib = await loadSubmit();
        const parsed = lib.parseVacancyForm(values, action);
        if (parsed.ok) await send(lib, parsed.body);
        else busy.current = false;
      },
      (invalid) => {
        busy.current = false;
        invalidFields(Object.keys(invalid));
      },
    )().catch(() => {
      // The lazy module itself failed to load, so only static code can speak.
      unlock();
      // `lib/toast` is a chunk of its own (the shell already holds it), so it can speak although the form's module could not load.
      if (mounted.current)
        void import('@/lib/toast').then(
          ({ toast }) =>
            toast.error(t('toast.noConnection'), {
              description: t('toast.noConnectionDescription'),
              action: retryAction(action),
            }),
          () => undefined,
        );
    });
  };

  return {
    submit,
    pendingMode,
    pending: pendingMode !== null,
    lib,
    feedback,
    alert,
    clearAlert: () => setAlert(null),
    summary,
    announce,
  };
}
