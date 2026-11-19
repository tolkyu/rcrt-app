'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { hasVisibleChar } from '@/lib/visible-text';
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
  /** Three lines at most, full text in `title`: a description that carries user text must not push the buttons off a phone. */
  clampDescription?: boolean;
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
  /** Opens on the primary button instead of Cancel, for a non-destructive action Enter should confirm. */
  focusConfirm?: boolean;
}

/** The counter turns to a warning once this share of the limit is used (450 of 500). */
const WARN_SHARE = 0.9;

// Long Ukrainian labels wrap instead of pushing the footer past the viewport (WCAG 1.4.10); px-7 leaves room for the pending spinner.
const actionClass =
  'h-auto min-h-12 px-7 py-2 text-center whitespace-normal [overflow-wrap:anywhere] md:min-h-10';

function ConfirmBody({
  title,
  description,
  clampDescription = false,
  consequence,
  tone = 'neutral',
  confirmLabel,
  cancelLabel,
  reason,
  pending = false,
  error,
  onConfirm,
  confirmRef,
}: Omit<
  ConfirmDialogProps,
  'open' | 'onOpenChange' | 'onCloseAutoFocus' | 'focusConfirm'
> & { confirmRef: Ref<HTMLButtonElement> }) {
  const t = useTranslations('common');
  const fieldId = useId();
  const [text, setText] = useState('');
  const length = (reason?.countLength ?? trimmedTextLength)(text);
  const blocker = !reason
    ? null
    : !hasVisibleChar(text)
      ? t('confirmReasonRequired')
      : length > reason.maxLength
        ? t('confirmReasonTooLong', { max: reason.maxLength })
        : null;
  return (
    <>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      {/* Only this part scrolls, so the buttons stay reachable at 320 px or 200% zoom; -m-1/p-1 keeps the focus ring inside the clip. */}
      <div className="-m-1 flex min-h-0 flex-col gap-4 overflow-y-auto p-1">
        {description && (
          <AlertDialogDescription
            className={cn(
              '[overflow-wrap:anywhere]',
              clampDescription && 'line-clamp-3',
            )}
            title={
              clampDescription && typeof description === 'string'
                ? description
                : undefined
            }
          >
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
            counter={{
              count: length,
              max: reason.maxLength,
              warnFrom: Math.ceil(reason.maxLength * WARN_SHARE),
            }}
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
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="[overflow-wrap:anywhere]">{error}</span>
          </p>
        )}
      </div>
      <span role="status" className="sr-only">
        {pending ? t('confirmPending') : ''}
      </span>
      <AlertDialogFooter className={reason ? 'md:items-start' : undefined}>
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
          // The blocker is visible text under the button on every device; keep its height when it goes, so the dialog does not jump.
          reserveSpace={Boolean(reason)}
          alwaysVisible
          className="max-md:w-full"
        >
          <Button
            ref={confirmRef}
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={cn(
              actionClass,
              'relative max-md:w-full',
              // A request in flight is not a refusal: the button keeps its fill instead of turning grey.
              pending &&
                (tone === 'destructive'
                  ? 'aria-disabled:bg-destructive aria-disabled:text-white'
                  : 'aria-disabled:bg-primary aria-disabled:text-primary-foreground'),
            )}
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
  focusConfirm = false,
  ...body
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // A request in flight cannot be cancelled from here: closing would hide its outcome.
  const requestOpenChange = (next: boolean) => {
    if (!(body.pending && !next)) onOpenChange(next);
  };
  return (
    <AlertDialog open={open} onOpenChange={requestOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={
          focusConfirm
            ? (event) => {
                event.preventDefault();
                confirmRef.current?.focus();
              }
            : undefined
        }
        onOverlayPress={() => requestOpenChange(false)}
        {...(body.description ? {} : { 'aria-describedby': undefined })}
      >
        <ConfirmBody {...body} confirmRef={confirmRef} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
