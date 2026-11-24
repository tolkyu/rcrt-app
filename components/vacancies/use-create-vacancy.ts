'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { useSubmitLifecycle } from '@/components/vacancies/use-submit-lifecycle';
import {
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import { loadSubmit, type SubmitModule } from '@/lib/vacancy-form-load';
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
  const [alert, setAlert] = useState<CreateAlert>(null);
  const life = useSubmitLifecycle({
    form: { handleSubmit, subscribe },
    modeRef,
    loadLib: loadSubmit,
  });
  const { mounted, feedback, invalidFields, setPendingMode, unlock } = life;

  const showFailure = (
    lib: SubmitModule,
    effect: FinalFailure,
    retry: () => void,
  ) =>
    lib.showCreateFailure(
      {
        queryClient,
        t,
        tVacancies,
        setError,
        invalidFields,
        showAlert: feedback ? setAlert : null,
        router,
      },
      effect,
      retry,
    );

  const send = async (lib: SubmitModule, body: CreateVacancyBody) => {
    setAlert(null);
    setPendingMode(body.mode);
    attempts.current ??= lib.createAttemptKeys();
    const outcome = await lib.submitCreate(queryClient, attempts.current, body);
    if (outcome.status === 'failed') {
      unlock();
      if (mounted.current)
        showFailure(
          lib,
          outcome.effect,
          life.ifMounted(() => submit(body.mode)),
        );
      return;
    }
    // A success stays locked until the page unmounts: a press during the navigation must not create a second vacancy.
    if (!mounted.current) return;
    const href = lib.announceCreated(t, body, outcome.created);
    guard.current?.release();
    router.replace(href);
  };

  const submit = (action: VacancyFormMode) =>
    life.submit(action, (lib, _values, body) => send(lib, body));

  return {
    submit,
    pendingMode: life.pendingMode,
    pending: life.pendingMode !== null,
    lib: life.lib,
    feedback,
    alert,
    clearAlert: () => setAlert(null),
    summary: life.summary,
    announce: life.announce,
  };
}
