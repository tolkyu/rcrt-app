'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Me } from '@/lib/schemas/me';
import {
  FULL_NAME_MAX,
  fullNameIssue,
  normalizeFullName,
} from '@/lib/profile-name';

type NameError = 'nameRequired' | 'nameTooLong';

function nameError(value: string): NameError | null {
  const issue = fullNameIssue(normalizeFullName(value));
  return issue === null
    ? null
    : issue === 'too_big'
      ? 'nameTooLong'
      : 'nameRequired';
}

/** Optimistic name edit: the shell and this card update at once and roll back on failure (UI-07). */
export function ProfileNameForm({ fullName }: { fullName: string }) {
  const t = useTranslations('profile');
  const queryClient = useQueryClient();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [value, setValue] = useState(fullName);
  const [error, setError] = useState<NameError | null>(null);

  const mutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest('/me', {
        method: 'PATCH',
        body: { fullName: name },
        schema: async () => (await import('@/lib/schemas/me')).meSchema,
      }),
    onMutate: async (name) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.me(),
        exact: true,
      });
      const previous = queryClient.getQueryData<Me>(queryKeys.me());
      queryClient.setQueryData<Me>(queryKeys.me(), (current) =>
        current
          ? { ...current, user: { ...current.user, fullName: name } }
          : current,
      );
      return { previous };
    },
    onError: (failure, _name, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.me(), context.previous);
        setValue(context.previous.user.fullName);
      }
      if (failure instanceof ApiError && failure.status === 400) {
        setError(
          failure.fieldErrors.some((field) => field.code === 'too_big')
            ? 'nameTooLong'
            : 'nameRequired',
        );
      }
      toast.error(t('saveFailed'));
    },
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.me(), me);
      setValue(me.user.fullName);
      toast.success(t('saved'));
    },
  });

  const normalized = normalizeFullName(value);
  const unchanged = normalized === fullName;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = nameError(value);
    setError(problem);
    if (problem || unchanged) return;
    mutation.mutate(normalized);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{t('nameLabel')}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Input
          id={inputId}
          name="fullName"
          autoComplete="name"
          value={value}
          maxLength={FULL_NAME_MAX + 20}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(nameError(event.target.value));
          }}
          className="sm:flex-1"
        />
        <Button
          type="submit"
          disabled={mutation.isPending || unchanged}
          className="h-11 md:h-10"
        >
          {mutation.isPending ? t('saving') : t('save')}
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-error-text text-sm">
          {error === 'nameTooLong'
            ? t('nameTooLong', { max: FULL_NAME_MAX })
            : t('nameRequired')}
        </p>
      )}
      <p id={hintId} className="text-muted-foreground text-xs">
        {t('nameHint')}
      </p>
    </form>
  );
}
