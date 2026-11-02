'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  VERTICAL_NAME_MAX,
  VERTICAL_NAME_MIN,
  type SettingsVertical,
  type SettingsVerticalList,
} from '@/lib/schemas/vertical';
import { toast } from '@/lib/toast';

type NameError =
  'required' | 'tooShort' | 'tooLong' | 'duplicate' | 'unchanged';

function nameError(name: string): NameError | null {
  if (name.length === 0) return 'required';
  if (name.length < VERTICAL_NAME_MIN) return 'tooShort';
  if (name.length > VERTICAL_NAME_MAX) return 'tooLong';
  return null;
}

const byName = (a: SettingsVertical, b: SettingsVertical) =>
  a.name.localeCompare(b.name, 'uk');

const loadSchema = async () =>
  (await import('@/lib/schemas/vertical')).settingsVerticalSchema;

/** Create (`target = null`) or rename a vertical; rename patches the row at once and rolls back on error (§2.2). */
export function VerticalNameDialog({
  target,
  onClose,
}: {
  target: SettingsVertical | null;
  onClose: () => void;
}) {
  const t = useTranslations('settings.verticals');
  const tCommon = useTranslations('settings.common');
  const tClose = useTranslations('common');
  const queryClient = useQueryClient();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [value, setValue] = useState(target?.name ?? '');
  const [error, setError] = useState<NameError | null>(null);
  const key = queryKeys.settingsVerticals();
  const name = value.trim();

  const setList = (update: (items: SettingsVertical[]) => SettingsVertical[]) =>
    queryClient.setQueryData<SettingsVerticalList>(key, (current) =>
      current ? { items: update(current.items).sort(byName) } : current,
    );

  const fail = (failure: unknown) => {
    if (failure instanceof ApiError && failure.code === 'VERTICAL_NAME_TAKEN')
      return setError('duplicate');
    if (failure instanceof ApiError && failure.code === 'STALE_STATE') {
      void queryClient.invalidateQueries({ queryKey: key });
      return toast.error(tCommon('conflict'));
    }
    toast.error(tCommon('saveFailed'));
  };

  const create = useMutation({
    mutationFn: (newName: string) =>
      apiRequest('/verticals', {
        method: 'POST',
        body: { name: newName },
        schema: loadSchema,
      }),
    onError: fail,
    onSuccess: (created) => {
      setList((items) => [...items, created]);
      toast.success(t('toastCreated', { name: created.name }));
      onClose();
    },
  });

  const rename = useMutation({
    mutationFn: ({
      vertical,
      newName,
    }: {
      vertical: SettingsVertical;
      newName: string;
    }) =>
      apiRequest(`/verticals/${vertical.id}`, {
        method: 'PATCH',
        body: { name: newName, expectedVersion: vertical.version },
        schema: loadSchema,
      }),
    onMutate: async ({ vertical, newName }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SettingsVerticalList>(key);
      setList((items) =>
        items.map((item) =>
          item.id === vertical.id ? { ...item, name: newName } : item,
        ),
      );
      return { previous };
    },
    onError: (failure, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      fail(failure);
    },
    onSuccess: (renamed, { vertical }) => {
      setList((items) =>
        items.map((item) => (item.id === renamed.id ? renamed : item)),
      );
      toast.success(
        t('toastRenamed', { from: vertical.name, to: renamed.name }),
      );
      onClose();
    },
  });

  const pending = create.isPending || rename.isPending;
  const unchanged = target !== null && name === target.name;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = nameError(name);
    setError(problem);
    if (problem || unchanged || pending) return;
    if (target) rename.mutate({ vertical: target, newName: name });
    else create.mutate(name);
  };

  const shownError = error ?? (unchanged ? 'unchanged' : null);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent closeLabel={tClose('close')}>
        <DialogTitle>
          {target ? t('dialog.renameTitle') : t('dialog.createTitle')}
        </DialogTitle>
        {target && (
          <DialogDescription>
            {t('dialog.currentName', { name: target.name })}
          </DialogDescription>
        )}
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={inputId}>{t('dialog.nameLabel')}</Label>
              <span
                className="text-muted-foreground text-xs"
                aria-hidden="true"
              >
                {tCommon('charCounter', {
                  count: name.length,
                  max: VERTICAL_NAME_MAX,
                })}
              </span>
            </div>
            <Input
              id={inputId}
              name="name"
              autoComplete="off"
              value={value}
              maxLength={VERTICAL_NAME_MAX + 20}
              aria-invalid={error ? true : undefined}
              aria-describedby={shownError ? `${errorId} ${hintId}` : hintId}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(nameError(event.target.value.trim()));
              }}
            />
            {shownError && (
              <p
                id={errorId}
                className={
                  error
                    ? 'text-error-text text-sm'
                    : 'text-muted-foreground text-sm'
                }
              >
                {t(`dialog.errors.${shownError}`)}
              </p>
            )}
            <p id={hintId} className="text-muted-foreground text-xs">
              {target ? t('dialog.renameNote') : t('dialog.nameHint')}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end [&>button]:h-12 sm:[&>button]:h-10">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending || unchanged}>
              {pending
                ? tCommon('saving')
                : target
                  ? t('dialog.renameSubmit')
                  : t('dialog.createSubmit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
