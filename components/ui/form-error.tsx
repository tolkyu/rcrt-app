'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface FormErrorLink {
  /** Id of the control that takes focus. */
  id: string;
  label: string;
}

const MAX_LINKS = 3;

function Summary({
  count,
  links,
  className,
}: {
  count: number;
  links: readonly FormErrorLink[];
  className?: string;
}) {
  const t = useTranslations('form');
  const shown = links.slice(0, MAX_LINKS);
  const hidden = links.length - shown.length;
  return (
    <div
      className={cn(
        'bg-destructive-subtle text-error-text rounded-lg p-3 text-sm font-medium',
        className,
      )}
    >
      <div
        role="alert"
        data-slot="form-error"
        className="flex items-start gap-2"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t('errorSummary', { count })}
      </div>
      {shown.length > 0 && (
        <ul className="mt-1 flex flex-wrap items-center gap-x-4 pl-6 font-normal">
          {shown.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-8 items-center underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(id)?.focus();
                }}
              >
                {label}
              </a>
            </li>
          ))}
          {hidden > 0 && <li>{t('errorSummaryMore', { count: hidden })}</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Submit-time summary, announced once per failed submit: render it with the invalid-field count taken at submit and
 * bump `attempt` on every failed submit so the same count is announced again; per-field errors speak for themselves after blur.
 * `links` name the invalid fields (three shown) outside the live region, so the announcement stays short.
 */
export function FormError({
  count,
  attempt,
  links = [],
  className,
}: {
  count: number;
  attempt: number;
  links?: readonly FormErrorLink[];
  className?: string;
}) {
  if (count < 1) return null;
  return (
    <Summary key={attempt} count={count} links={links} className={className} />
  );
}
