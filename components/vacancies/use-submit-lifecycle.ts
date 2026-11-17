'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useSubmissionLock } from '@/components/vacancies/use-submission-lock';
import { useFieldSummary } from '@/components/vacancies/use-field-summary';
import type { CreateVacancyBody } from '@/lib/schemas/vacancy';
import type {
  FilledField,
  VacancyFormMode,
  VacancyFormValues,
} from '@/lib/vacancy-form';
import {
  loadFeedback,
  type FeedbackModule,
  type SubmitModule,
} from '@/lib/vacancy-form-load';

/**
 * What the create and the edit form share around a send: the lazy module and the inline pieces loaded on mount, the synchronous lock,
 * the validate-then-run skeleton of a press, and the offline toast that static code can still raise (PERF-04).
 */
export function useSubmitLifecycle<Lib extends SubmitModule>({
  form: { handleSubmit, subscribe },
  modeRef,
  loadLib,
  filled,
}: {
  form: Pick<UseFormReturn<VacancyFormValues>, 'handleSubmit' | 'subscribe'>;
  modeRef: RefObject<VacancyFormMode>;
  loadLib: () => Promise<Lib>;
  /** Fields that must not be blank whatever the action (the edit form). */
  filled?: readonly FilledField[];
}) {
  const t = useTranslations('vacancyForm');
  const { mountedRef, busyRef, tryLock } = useSubmissionLock();
  // The inline pieces (spinner, alerts, link) load on mount like the submit module; until they have, an alert reaches the user as a toast.
  const [lib, setLib] = useState<Lib | null>(null);
  const [feedback, setFeedback] = useState<FeedbackModule | null>(null);
  const [pendingMode, setPendingMode] = useState<VacancyFormMode | null>(null);
  const fields = useFieldSummary(subscribe);

  useEffect(() => {
    loadLib().then(
      (loaded) => mountedRef.current && setLib(loaded),
      () => undefined,
    );
    loadFeedback().then(
      (loaded) => mountedRef.current && setFeedback(loaded),
      () => undefined,
    );
  }, [loadLib, mountedRef]);

  const unlock = () => {
    busyRef.current = false;
    setPendingMode(null);
  };

  /** A toast action or other late callback must not touch a form that has gone. */
  const ifMounted = (run: () => void) => () => {
    if (mountedRef.current) run();
  };

  // `lib/toast` is a chunk of its own (the shell already holds it), so it can speak although the form's module could not load.
  const speakOffline = (retry: () => void) => {
    if (!mountedRef.current) return;
    void import('@/lib/toast').then(
      ({ toast }) =>
        toast.error(t('toast.noConnection'), {
          description: t('toast.noConnectionDescription'),
          action: { label: t('toast.retry'), onAction: ifMounted(retry) },
        }),
      () => undefined,
    );
  };

  /** One press: lock, validate for `action`, then `run` with the parsed body; the lock stays until `run` ends the attempt (`unlock`) or the page goes. */
  const submit = (
    action: VacancyFormMode,
    run: (
      lib: Lib,
      values: VacancyFormValues,
      body: CreateVacancyBody,
    ) => Promise<void>,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    modeRef.current = action;
    handleSubmit(
      async (values) => {
        fields.clearSummary();
        const loaded = await loadLib();
        const parsed = loaded.parseVacancyForm(values, action, filled);
        if (parsed.ok) await run(loaded, values, parsed.body);
        else busyRef.current = false;
      },
      (invalid) => {
        busyRef.current = false;
        fields.invalidFields(Object.keys(invalid));
      },
    )().catch(() => {
      // The lazy module itself failed to load, so only static code can speak.
      unlock();
      speakOffline(() => submit(action, run));
    });
  };

  return {
    ...fields,
    mounted: mountedRef,
    tryLock,
    lib,
    feedback,
    pendingMode,
    unlock,
    ifMounted,
    speakOffline,
    submit,
    setPendingMode,
  };
}
