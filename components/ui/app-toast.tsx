'use client';

import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { toast as sonner } from 'sonner';
import type { ToastAction, ToastTone } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Button } from './button';

const TONES = {
  success: {
    Icon: CircleCheck,
    border: 'border-success/40',
    circle: 'bg-success-subtle text-success-text',
  },
  info: {
    Icon: Info,
    border: 'border-info/40',
    circle: 'bg-info-subtle text-info-text',
  },
  warning: {
    Icon: TriangleAlert,
    border: 'border-warning/50',
    circle: 'bg-warning-subtle text-warning-text',
  },
  error: {
    Icon: CircleX,
    border: 'border-destructive/40',
    circle: 'bg-destructive-subtle text-error-text',
  },
} as const satisfies Record<
  ToastTone,
  { Icon: typeof Info; border: string; circle: string }
>;

export interface AppToastProps {
  id: string | number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
}

/** Sonner's region is already polite; only errors add `role="alert"` to interrupt. */
export function AppToast({
  id,
  tone,
  title,
  description,
  action,
}: AppToastProps) {
  const t = useTranslations('common');
  const { Icon, border, circle } = TONES[tone];
  // Sonner removes the toast a frame later and for 200 ms it still takes clicks.
  const acted = useRef(false);
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      data-slot="toast"
      data-tone={tone}
      className={cn(
        'bg-surface text-foreground flex w-(--width) max-w-full items-start gap-3 rounded-lg border p-3 shadow-lg',
        border,
      )}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full',
          circle,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <p className="text-sm leading-5 font-semibold [overflow-wrap:anywhere]">
          {title}
        </p>
        {description && (
          <p className="text-muted-foreground line-clamp-2 text-sm leading-5 [overflow-wrap:anywhere]">
            {description}
          </p>
        )}
        {action && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 h-11 self-start md:h-8"
            onClick={() => {
              if (acted.current) return;
              acted.current = true;
              sonner.dismiss(id);
              action.onAction();
            }}
          >
            {action.label}
          </Button>
        )}
      </div>
      <button
        type="button"
        aria-label={t('close')}
        onClick={() => sonner.dismiss(id)}
        className="text-muted-foreground hover:bg-surface-muted hover:text-foreground relative grid size-8 shrink-0 place-items-center rounded-md transition-colors duration-(--duration-press) before:absolute before:-inset-1.5"
      >
        <X className="pointer-events-none size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
