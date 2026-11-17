'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { useSubmissionLock } from './use-submission-lock';
import {
  emptyRequest,
  REQUEST_FIELDS,
  REQUEST_FIELD_IDS,
  type RequestErrors,
  type RequestField,
  type RequestNotice,
  type VacancyRequestValues,
} from '@/lib/vacancy-request-form';

export const loadRequest = () => import('@/lib/vacancy-request-submit');
type RequestModule = Awaited<ReturnType<typeof loadRequest>>;

export function useRequestVacancy(guard: RefObject<LeaveGuardHandle | null>) {
  const t = useTranslations('vacancyRequest');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mountedRef, busyRef, tryLock } = useSubmissionLock();
  const attempts = useRef<ReturnType<
    RequestModule['createAttemptKeys']
  > | null>(null);
  const [values, setValues] = useState<VacancyRequestValues>(emptyRequest);
  const latestRef = useRef(values);
  const [errors, setErrors] = useState<RequestErrors>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<RequestNotice | null>(null);
  const [summary, setSummary] = useState(0);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const unavailableRef = useRef<string | null>(null);
  useEffect(() => {
    loadRequest().catch(() => undefined);
  }, []);

  const change = <K extends RequestField>(
    field: K,
    value: VacancyRequestValues[K],
  ) => {
    if (busyRef.current) return;
    latestRef.current = { ...latestRef.current, [field]: value };
    setValues(latestRef.current);
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSummary(0);
  };
  const validateField = (field: RequestField) => {
    const snapshot = latestRef.current[field];
    loadRequest().then(
      (lib) => {
        if (
          !mountedRef.current ||
          busyRef.current ||
          latestRef.current[field] !== snapshot
        )
          return;
        const result = lib.parseRequest(latestRef.current);
        const refused =
          field === 'positionId' &&
          latestRef.current.positionId === unavailableRef.current;
        setErrors((current) => ({
          ...current,
          [field]: !result.ok
            ? result.errors[field]
            : refused
              ? 'positionUnavailable'
              : undefined,
        }));
      },
      () => undefined,
    );
  };
  const showFields = (next: RequestErrors) => {
    setErrors(next);
    setSummary((previous) => previous + 1);
    const first = REQUEST_FIELDS.find((field) => next[field]);
    if (first) document.getElementById(REQUEST_FIELD_IDS[first])?.focus();
  };
  const run = async () => {
    let succeeded = false;
    try {
      const lib = await loadRequest();
      if (!mountedRef.current) return;
      const parsed = lib.parseRequest(values);
      if (!parsed.ok) {
        showFields(parsed.errors);
        return;
      }
      if (values.positionId === unavailable) {
        showFields({ positionId: 'positionUnavailable' });
        return;
      }
      attempts.current ??= lib.createAttemptKeys();
      const outcome = await lib.submitRequest(
        queryClient,
        attempts.current,
        parsed.body,
      );
      if (!outcome.ok) {
        if (!mountedRef.current) return;
        if (outcome.failure.kind === 'fields') {
          showFields(outcome.failure.errors);
          if (outcome.failure.errors.positionId === 'positionUnavailable') {
            unavailableRef.current = values.positionId;
            setUnavailable(values.positionId);
            lib.refreshRequestPositions(queryClient).catch(() => undefined);
          }
        } else {
          setNotice(outcome.failure.notice);
          lib.toast.error(t(`errors.${outcome.failure.notice}`), {
            id: 'vacancy-request-error',
            action:
              outcome.failure.notice === 'network' ||
              outcome.failure.notice === 'failed'
                ? {
                    label: t('retry'),
                    onAction: () => {
                      if (mountedRef.current) submit();
                    },
                  }
                : undefined,
          });
        }
        return;
      }
      succeeded = true;
      if (!mountedRef.current) return;
      lib.toast.success(t('success'));
      guard.current?.release();
      router.replace(`/vacancies/${outcome.created.id}`);
    } catch {
      if (mountedRef.current) setNotice('network');
    } finally {
      if (!succeeded) {
        busyRef.current = false;
        if (mountedRef.current) setPending(false);
      }
    }
  };
  const submit = () => {
    if (notice === 'forbidden' || !tryLock()) return;
    setPending(true);
    setNotice(null);
    run().catch(() => undefined);
  };
  return {
    values,
    errors,
    change,
    validateField,
    pending,
    notice,
    submit,
    summary,
    dirty: REQUEST_FIELDS.some(
      (field) => values[field] !== emptyRequest[field],
    ),
  };
}
