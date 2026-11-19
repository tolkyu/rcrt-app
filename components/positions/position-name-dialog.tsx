'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { selectClass } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import {
  findNameConflict,
  mergePosition,
  type PositionVertical,
} from '@/lib/position-list';
import {
  normalizePositionName,
  POSITION_NAME_MAX,
  positionNameProblem,
  type PositionNameProblem,
} from '@/lib/position-name';
import { MANAGER_POSITIONS, positionsQuery } from '@/lib/queries/positions';
import {
  POSITION_PER_VERTICAL_LIMIT,
  type Position,
} from '@/lib/schemas/position';
import { toast } from '@/lib/toast';
import {
  classifyFailure,
  loadPositionSchema,
  POSITION_SAVE_KEY,
  updatePositionList,
  usePositionFailureToast,
} from './position-write';

type FieldProblem =
  | { readonly kind: PositionNameProblem | 'unchanged' }
  | { readonly kind: 'duplicate' | 'duplicateInactive'; readonly name: string };
type Banner = 'stale' | 'limitReached' | 'rateLimited';

interface SaveInput {
  readonly target: Position | null;
  readonly verticalId: string;
  readonly name: string;
}

/** Create (`target = null`) or rename a position; both wait for the server because name uniqueness is a server truth (ADR-013). */
export function PositionNameDialog({
  target,
  verticals,
  presetVerticalId,
  onClose,
  onCloseAutoFocus,
}: {
  target: Position | null;
  verticals: readonly PositionVertical[];
  presetVerticalId: string | undefined;
  onClose: (focusKey?: string) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const t = useTranslations('positions');
  const tCommon = useTranslations('settings.common');
  const tClose = useTranslations('common');
  const notifyFailure = usePositionFailureToast();
  const queryClient = useQueryClient();
  const list = useQuery(positionsQuery(MANAGER_POSITIONS));
  const items = list.data?.items ?? [];
  const live = target
    ? (items.find((item) => item.id === target.id) ?? target)
    : null;
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [value, setValue] = useState(target?.name ?? '');
  const [verticalId, setVerticalId] = useState(
    verticals.length === 1 ? verticals[0]!.id : (presetVerticalId ?? ''),
  );
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const [verticalMissing, setVerticalMissing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const name = normalizePositionName(value);
  const targetVerticalId = live?.verticalId ?? verticalId;

  const conflictProblem = (): FieldProblem | null => {
    const conflict = findNameConflict(items, targetVerticalId, name, live?.id);
    if (!conflict) return null;
    return {
      kind: conflict.isActive ? 'duplicate' : 'duplicateInactive',
      name: conflict.name,
    };
  };

  const save = useMutation({
    mutationKey: POSITION_SAVE_KEY,
    mutationFn: ({
      target: row,
      verticalId: vertical,
      name: next,
    }: SaveInput) =>
      row
        ? apiRequest(`/positions/${row.id}`, {
            method: 'PATCH',
            body: { expectedVersion: row.version, name: next },
            schema: loadPositionSchema,
          })
        : apiRequest('/positions', {
            method: 'POST',
            body: { verticalId: vertical, name: next },
            schema: loadPositionSchema,
          }),
    onSuccess: (saved, { target: row }) => {
      updatePositionList(queryClient, (current) =>
        mergePosition(current, saved),
      );
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      if (row) {
        // Vacancy rows and cards carry the position name.
        void queryClient.invalidateQueries({ queryKey: ['vacancies'] });
        void queryClient.invalidateQueries({ queryKey: ['vacancy'] });
        toast.success(t('toast.renamed', { from: row.name, to: saved.name }));
        onClose(`rename:${saved.id}`);
      } else {
        toast.success(t('toast.created', { name: saved.name }));
        onClose(`name:${saved.id}`);
      }
    },
    onError: (error) => {
      const failure = classifyFailure(error);
      if (failure === 'nameTaken') {
        const known = conflictProblem();
        return setProblem(known ?? { kind: 'duplicate', name });
      }
      if (failure === 'invalid') return setProblem({ kind: 'invalid' });
      if (failure === 'stale') {
        setBanner('stale');
        return void queryClient.invalidateQueries({ queryKey: ['positions'] });
      }
      if (failure === 'limitReached' || failure === 'rateLimited')
        return setBanner(failure);
      if (failure === 'mfaRequired') return onClose();
      notifyFailure(failure);
      if (failure === 'notFound') {
        void queryClient.invalidateQueries({ queryKey: ['positions'] });
        onClose();
      }
    },
  });

  const pending = save.isPending;
  const unchanged = live !== null && name === live.name;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setBanner(null);
    if (!live && !verticalId) {
      setVerticalMissing(true);
      return selectRef.current?.focus();
    }
    const found = positionNameProblem(value);
    const next: FieldProblem | null = found
      ? { kind: found }
      : unchanged
        ? { kind: 'unchanged' }
        : conflictProblem();
    setProblem(next);
    if (next) return inputRef.current?.focus();
    save.mutate({ target: live, verticalId, name });
  };

  const shown: FieldProblem | null =
    problem ?? (unchanged ? { kind: 'unchanged' } : null);
  const invalid = problem !== null && problem.kind !== 'unchanged';
  const nameId = `${ids}-name`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const verticalFieldId = `${ids}-vertical`;
  const bannerMessage = {
    stale: t('errors.stale'),
    limitReached: t('dialog.errors.limitReached', {
      max: POSITION_PER_VERTICAL_LIMIT,
    }),
    rateLimited: t('errors.rateLimited'),
  } as const;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        closeLabel={tClose('close')}
        onCloseAutoFocus={onCloseAutoFocus}
        {...(live ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          if (!live && !verticalId) return;
          event.preventDefault();
          inputRef.current?.focus();
          if (live) inputRef.current?.select();
        }}
      >
        <DialogTitle>
          {live ? t('dialog.renameTitle') : t('dialog.createTitle')}
        </DialogTitle>
        {live && (
          <DialogDescription>
            {t('dialog.currentName', { name: live.name })}
          </DialogDescription>
        )}
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {!live && verticals.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={verticalFieldId}>
                {t('dialog.verticalLabel')}
              </Label>
              <select
                ref={selectRef}
                id={verticalFieldId}
                value={verticalId}
                aria-invalid={verticalMissing || undefined}
                aria-describedby={
                  verticalMissing ? `${ids}-vertical-error` : undefined
                }
                className={selectClass}
                onChange={(event) => {
                  setVerticalId(event.target.value);
                  setVerticalMissing(false);
                  setProblem((current) =>
                    current?.kind === 'duplicate' ||
                    current?.kind === 'duplicateInactive'
                      ? null
                      : current,
                  );
                }}
              >
                <option value="">{t('dialog.verticalPlaceholder')}</option>
                {verticals.map((vertical) => (
                  <option key={vertical.id} value={vertical.id}>
                    {vertical.name}
                  </option>
                ))}
              </select>
              {verticalMissing && (
                <p
                  id={`${ids}-vertical-error`}
                  className="text-error-text text-sm"
                >
                  {t('dialog.errors.verticalRequired')}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={nameId}>{t('dialog.nameLabel')}</Label>
              <span
                className="text-muted-foreground text-xs"
                aria-hidden="true"
              >
                {tCommon('charCounter', {
                  count: name.length,
                  max: POSITION_NAME_MAX,
                })}
              </span>
            </div>
            <Input
              ref={inputRef}
              id={nameId}
              name="name"
              autoComplete="off"
              value={value}
              maxLength={POSITION_NAME_MAX + 20}
              aria-invalid={invalid || undefined}
              aria-describedby={shown ? `${errorId} ${hintId}` : hintId}
              onChange={(event) => {
                setValue(event.target.value);
                if (problem) setProblem(null);
              }}
              onBlur={(event) => {
                // Leaving through Cancel or the × must not flash an error on a dialog that is closing.
                const next = event.relatedTarget;
                if (next instanceof HTMLButtonElement && next.type === 'button')
                  return;
                const found = value ? positionNameProblem(value) : null;
                if (found) setProblem({ kind: found });
              }}
            />
            {shown && (
              <p
                id={errorId}
                role={invalid ? 'alert' : undefined}
                className={
                  invalid
                    ? 'text-error-text text-sm'
                    : 'text-muted-foreground text-sm'
                }
              >
                {shown.kind === 'duplicate' ||
                shown.kind === 'duplicateInactive'
                  ? t(`dialog.errors.${shown.kind}`, { name: shown.name })
                  : t(`dialog.errors.${shown.kind}`)}
              </p>
            )}
            <p id={hintId} className="text-muted-foreground text-xs">
              {live ? t('dialog.renameNote') : t('dialog.nameHint')}
            </p>
          </div>
          {banner && (
            <div
              role="alert"
              className="bg-warning-subtle text-warning-text flex items-start gap-2 rounded-lg p-3 text-sm"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {bannerMessage[banner]}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end [&>button]:h-12 sm:[&>button]:h-10">
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose()}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending || unchanged}>
              {pending
                ? tCommon('saving')
                : live
                  ? t('dialog.renameSubmit')
                  : t('dialog.createSubmit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
