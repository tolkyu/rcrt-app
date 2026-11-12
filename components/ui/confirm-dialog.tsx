'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { trimmedTextLength } from '@/lib/text-length';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from './alert-dialog';
import { Button } from './button';
import { DisabledReason } from './disabled-reason';
import { FormField } from './form-field';
import { Textarea } from './textarea';

export interface ConfirmReason {
  label: string;
  maxLength: number;
  hint?: string;
  /** Must count what the server schema counts; code points after trim by default. */
  countLength?: (value: string) => number;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** What the action changes, one line per effect. */
  consequence?: readonly ReactNode[];
  tone?: 'neutral' | 'destructive';
  confirmLabel: string;
  cancelLabel?: string;
  /** Makes a written reason mandatory; `onConfirm` receives it trimmed. */
  reason?: ConfirmReason;
  pending?: boolean;
  /** Inline failure (for example a 409) kept inside the dialog, where the user is looking. */
  error?: ReactNode;
  onConfirm: (reason: string) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

// Zero-width and other format characters (\p{Cf}) are not trimmed by String.trim, but show nothing.
const VISIBLE = /[^\s\p{Cf}]/u;

// Long Ukrainian labels wrap instead of pushing the footer past the viewport (WCAG 1.4.10); px-7 leaves room for the pending spinner.
const actionClass =
  'h-auto min-h-12 px-7 py-2 text-center whitespace-normal [overflow-wrap:anywhere] md:min-h-10';

function ConfirmBody({
  title,
  description,
  consequence,
  tone = 'neutral',
  confirmLabel,
  cancelLabel,
  reason,
  pending = false,
  error,
  onConfirm,
}: Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onCloseAutoFocus'>) {
  const t = useTranslations('common');
  const fieldId = useId();
  const [text, setText] = useState('');
  const length = (reason?.countLength ?? trimmedTextLength)(text);
  const blocker = !reason
    ? null
    : !VISIBLE.test(text)
      ? t('confirmReasonRequired')
      : length > reason.maxLength
        ? t('confirmReasonTooLong', { max: reason.maxLength })
        : null;
  return (
    <>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      {description && (
        <AlertDialogDescription className="[overflow-wrap:anywhere]">
          {description}
        </AlertDialogDescription>
      )}
      {consequence && consequence.length > 0 && (
        <ul className="text-foreground list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
          {consequence.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
      {reason && (
        <FormField
          id={fieldId}
          label={reason.label}
          required
          hint={reason.hint}
          counter={{ count: length, max: reason.maxLength }}
        >
          {(control) => (
            <Textarea
              {...control}
              value={text}
              readOnly={pending}
              aria-readonly={pending || undefined}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </FormField>
      )}
      {error && (
        <p
          role="alert"
          className="bg-destructive-subtle text-error-text flex items-start gap-2 rounded-lg p-3 text-sm"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="[overflow-wrap:anywhere]">{error}</span>
        </p>
      )}
      <span role="status" className="sr-only">
        {pending ? t('confirmPending') : ''}
      </span>
      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <Button
            variant="outline"
            aria-disabled={pending || undefined}
            className={actionClass}
          >
            {cancelLabel ?? t('cancel')}
          </Button>
        </AlertDialogCancel>
        <DisabledReason
          disabled={blocker !== null}
          reason={blocker ?? ''}
          // On touch the blocker is visible text under the button; keep its height when it goes, so the sheet does not jump.
          reserveSpace={Boolean(reason)}
          className="max-md:w-full"
        >
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={cn(actionClass, 'relative max-md:w-full')}
            onClick={() => {
              if (!pending) onConfirm(text.trim());
            }}
          >
            {pending && (
              // Fades in only after 150 ms and sits in the padding, so a quick save never flashes and the button keeps its width.
              <span
                aria-hidden="true"
                className="skeleton-delayed absolute inset-y-0 left-2 flex items-center"
              >
                <LoaderCircle className="size-3.5 animate-[spin_600ms_linear_infinite]" />
              </span>
            )}
            {confirmLabel}
          </Button>
        </DisabledReason>
      </AlertDialogFooter>
    </>
  );
}

/**
 * Confirmation over AlertDialog: Cancel holds the initial focus, Esc and a press on the overlay cancel (unless pending),
 * focus returns to whatever opened it. The reason text resets on every open because the body unmounts with the dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...body
}: ConfirmDialogProps) {
  // A request in flight cannot be cancelled from here: closing would hide its outcome.
  const requestOpenChange = (next: boolean) => {
    if (!(body.pending && !next)) onOpenChange(next);
  };
  return (
    <AlertDialog open={open} onOpenChange={requestOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        onOverlayPress={() => requestOpenChange(false)}
        {...(body.description ? {} : { 'aria-describedby': undefined })}
      >
        <ConfirmBody {...body} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
