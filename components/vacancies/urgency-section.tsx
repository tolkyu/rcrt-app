'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { FormField } from '@/components/ui/form-field';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { VacancyDetail } from '@/lib/schemas/vacancy';

const UrgencyToggle = lazy(() => import('./urgency-toggle'));

/** Same outer size as the real control (4 px padding around a 44 px, md 40 px, item), so the section does not jump when the chunk arrives. */
const ControlPlaceholder = () => (
  <span
    aria-hidden="true"
    className="bg-surface-muted block h-13 rounded-xl md:h-12"
  />
);

/** Without the chunk the section still says why there is no control. */
function Unavailable() {
  const t = useTranslations('vacancies.urgency');
  return (
    <p role="status" className="text-muted-foreground min-h-11 text-sm">
      {t('unavailable')}
    </p>
  );
}

/**
 * «Терміновість» of the card and the preview (VAC-08-2). The caller renders it only when `canChangeUrgency` is true, a synchronous
 * server decision, so nothing loads for anyone else. Heading, label and helper are static; only the control is lazy.
 * `onRemoved` (stable) fires when the section unmounts while focus is inside it, so the caller can place focus instead of leaving it on `<body>`.
 */
export function UrgencySection({
  vacancy,
  preview,
  Heading,
  onRemoved,
}: {
  vacancy: Pick<VacancyDetail, 'id' | 'number' | 'priority' | 'version'>;
  preview: boolean;
  Heading: 'h2' | 'h3';
  onRemoved: () => void;
}) {
  const t = useTranslations('vacancies.urgency');
  const sectionRef = useRef<HTMLElement>(null);
  // A layout cleanup runs before the node leaves the DOM, so the focus is still readable.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    return () => {
      if (section?.contains(document.activeElement)) onRemoved();
    };
  }, [onRemoved]);
  const key = preview ? 'preview' : 'detail';
  return (
    <section ref={sectionRef} aria-labelledby={`vacancy-urgency-${key}`}>
      <Heading
        id={`vacancy-urgency-${key}`}
        className="mb-0.5 text-sm font-semibold"
      >
        {t('title')}
      </Heading>
      <FormField
        id={`vacancy-urgency-field-${key}`}
        layout="group"
        label={<span className="sr-only">{t('label')}</span>}
        hint={t('hint')}
      >
        {(controlProps) => (
          <LoadBoundary fallback={<Unavailable />}>
            <Suspense fallback={<ControlPlaceholder />}>
              <UrgencyToggle vacancy={vacancy} controlProps={controlProps} />
            </Suspense>
          </LoadBoundary>
        )}
      </FormField>
    </section>
  );
}
