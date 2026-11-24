'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useState, type RefObject } from 'react';
import {
  RichTextLoadFailed,
  RichTextSkeleton,
} from '@/components/rich-text/rich-text-slot';
import { FormField } from '@/components/ui/form-field';
import { FormGroup } from '@/components/ui/form-group';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type {
  ContentDocs,
  FormContentHandle,
} from '@/lib/vacancy-content-form';

const createContent = () => lazy(() => import('./vacancy-form-content'));

/** Group «Опис і вимоги» of the create and draft forms (D117): the fields arrive in their own chunk, outside the route's initial JavaScript (PERF-04); while it loads, and when it fails, each field keeps its label and final height. */
export function VacancyFormContentSlot(props: {
  baseline: ContentDocs;
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  handleRef: RefObject<FormContentHandle | null>;
}) {
  const t = useTranslations('vacancyForm');
  const tContent = useTranslations('vacancies.contentEdit');
  const [attempt, setAttempt] = useState(() => ({
    Content: createContent(),
    key: 0,
  }));
  const placeholder = (failed: boolean) =>
    (['description', 'requirements'] as const).map((label) => (
      <div key={label} className="flex flex-col">
        <FormField
          id={`vacancy-content-${label}`}
          layout="group"
          label={tContent(label)}
        >
          {() =>
            failed ? (
              <RichTextLoadFailed
                onRetry={() =>
                  setAttempt(({ key }) => ({
                    Content: createContent(),
                    key: key + 1,
                  }))
                }
              />
            ) : (
              <RichTextSkeleton />
            )
          }
        </FormField>
        <div className="mt-2 h-11 md:h-8" />
      </div>
    ));
  const { Content } = attempt;
  return (
    <FormGroup id="vacancy-form-content" title={t('content')}>
      <LoadBoundary key={attempt.key} fallback={placeholder(true)}>
        <Suspense fallback={placeholder(false)}>
          <Content {...props} />
        </Suspense>
      </LoadBoundary>
    </FormGroup>
  );
}
