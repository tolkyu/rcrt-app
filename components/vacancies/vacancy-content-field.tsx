'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RichTextEditor } from '@/components/rich-text/rich-text-editor';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';
import { FormField } from '@/components/ui/form-field';
import type { EditorDocumentResult } from '@/lib/rich-text-editor-document';
import type { RichTextDoc } from '@/lib/schemas/rich-text';
import type { ContentField, ContentIntent } from '@/lib/vacancy-content-form';

export const CONTENT_FIELD_IDS = {
  descriptionDoc: 'vacancy-content-description',
  requirementsDoc: 'vacancy-content-requirements',
} as const satisfies Record<ContentField, string>;

export const CONTENT_FIELD_TEXT = {
  descriptionDoc: { label: 'description', empty: 'emptyDescription' },
  requirementsDoc: { label: 'requirements', empty: 'emptyRequirements' },
} as const satisfies Record<ContentField, { label: string; empty: string }>;

export type ContentErrorCode =
  'invalid' | 'too_large' | 'invalid_chars' | 'invalid_link';

export interface ContentFieldProps {
  field: ContentField;
  baseline: RichTextDoc | null;
  intent: ContentIntent;
  resetKey: number;
  disabled: boolean;
  errorCode: ContentErrorCode | undefined;
  onChange: (field: ContentField, result: EditorDocumentResult) => void;
  onReady: (field: ContentField, ready: boolean) => void;
  onClear: (field: ContentField) => void;
  onUndoClear: (field: ContentField) => void;
}

/** A cleared field keeps its editor mounted but hidden, so «Скасувати очищення» restores the exact buffer, invalid input included. */
export function VacancyContentField({
  field,
  baseline,
  intent,
  resetKey,
  disabled,
  errorCode,
  onChange,
  onReady,
  onClear,
  onUndoClear,
}: ContentFieldProps) {
  const t = useTranslations('vacancies.contentEdit');
  const cleared = intent.kind === 'clear';
  const nothingToClear = baseline === null && intent.kind === 'unchanged';
  const [loadFailed, setLoadFailed] = useState(false);
  // Only a failed chunk blocks Clear: it is the way out of an invalid stored document, and undo needs no editor.
  const clearBlocked = loadFailed && !cleared && !disabled && !nothingToClear;
  return (
    <div className="flex flex-col">
      <FormField
        id={CONTENT_FIELD_IDS[field]}
        layout="group"
        label={t(CONTENT_FIELD_TEXT[field].label)}
        error={errorCode && t(`errors.${errorCode}`)}
      >
        {(control) => (
          <>
            <div hidden={cleared}>
              <RichTextEditor
                {...control}
                initialDocument={baseline}
                resetKey={String(resetKey)}
                fieldLabel={t(CONTENT_FIELD_TEXT[field].label)}
                disabled={disabled || cleared}
                onChange={(result) => onChange(field, result)}
                onReadyChange={(ready) => onReady(field, ready)}
                onLoadFailedChange={setLoadFailed}
              />
            </div>
            {cleared && (
              <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                {t('cleared')}
              </p>
            )}
          </>
        )}
      </FormField>
      <div className="mt-2 flex h-11 items-center md:h-8">
        <DisabledReason
          reason={t('clearNeedsEditor')}
          disabled={clearBlocked}
          className="flex-row items-center gap-2"
        >
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-11 shrink-0 disabled:bg-transparent aria-disabled:bg-transparent md:h-8"
            disabled={disabled || nothingToClear}
            onClick={() => (cleared ? onUndoClear(field) : onClear(field))}
          >
            {cleared ? t('undoClear') : t('clear')}
          </Button>
        </DisabledReason>
      </div>
    </div>
  );
}
