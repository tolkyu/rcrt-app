'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { EditorDocumentResult } from '@/lib/rich-text-editor-document';
import {
  CONTENT_FIELDS,
  changeContent,
  clearContent,
  contentChanges,
  contentDirty,
  emptyContentFields,
  fieldDocument,
  invalidContentFields,
  sameContent,
  undoContentClear,
  type ContentDocs,
  type ContentField,
  type ContentFields,
  type FormContentHandle,
} from '@/lib/vacancy-content-form';
import { contentFieldErrors } from './vacancy-content-feedback';
import {
  CONTENT_FIELD_IDS,
  VacancyContentField,
} from './vacancy-content-field';

interface ContentState {
  baseline: ContentDocs;
  fields: ContentFields;
  resetKeys: Record<ContentField, number>;
}

/** A new baseline (a reload, or the save that stored these documents) restarts only the editors whose text differs from it, so a saved buffer keeps its undo history. */
function adopt(old: ContentState, baseline: ContentDocs): ContentState {
  const reset = (field: ContentField) =>
    old.fields[field].kind === 'clear' ||
    !sameContent(
      baseline[field],
      fieldDocument(old.baseline, field, old.fields[field]),
    );
  return {
    baseline,
    fields: emptyContentFields(),
    resetKeys: {
      descriptionDoc:
        old.resetKeys.descriptionDoc + Number(reset('descriptionDoc')),
      requirementsDoc:
        old.resetKeys.requirementsDoc + Number(reset('requirementsDoc')),
    },
  };
}

const NO_READY = () => undefined;

/** «Опис» and «Вимоги» inside the create and draft forms (VAC-01, D117): loaded after the form shell, sharing the content page's field, rules and errors; the form reads the documents through `handleRef` when it sends. */
export default function VacancyFormContent({
  baseline,
  disabled,
  onDirtyChange,
  handleRef,
}: {
  baseline: ContentDocs;
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  handleRef: RefObject<FormContentHandle | null>;
}) {
  const [state, setState] = useState<ContentState>(() => ({
    baseline,
    fields: emptyContentFields(),
    resetKeys: { descriptionDoc: 0, requirementsDoc: 0 },
  }));
  if (state.baseline !== baseline) setState(adopt(state, baseline));

  const latest = useRef(state);
  const dirtyChange = useRef(onDirtyChange);
  useLayoutEffect(() => {
    latest.current = state;
    dirtyChange.current = onDirtyChange;
  });
  const dirty = contentDirty(state.baseline, state.fields);
  useEffect(() => dirtyChange.current(dirty), [dirty]);
  useEffect(() => () => dirtyChange.current(false), []);

  useLayoutEffect(() => {
    handleRef.current = {
      collect: () => {
        const { baseline: stored, fields } = latest.current;
        const [invalid] = invalidContentFields(fields);
        if (invalid) {
          document.getElementById(CONTENT_FIELD_IDS[invalid])?.focus();
          return null;
        }
        return contentChanges(stored, fields);
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  // Stable handlers: the editors keep the callbacks of the render that created them.
  const onChange = useCallback(
    (field: ContentField, result: EditorDocumentResult) =>
      setState((old) => ({
        ...old,
        fields: changeContent(old.baseline, old.fields, field, result),
      })),
    [],
  );
  const onClear = useCallback(
    (field: ContentField) =>
      setState((old) => ({ ...old, fields: clearContent(old.fields, field) })),
    [],
  );
  const onUndoClear = useCallback(
    (field: ContentField) =>
      setState((old) => ({
        ...old,
        fields: undoContentClear(old.fields, field),
      })),
    [],
  );

  const { byField } = contentFieldErrors(state.fields, { kind: 'idle' });
  return CONTENT_FIELDS.map((field) => (
    <VacancyContentField
      key={field}
      field={field}
      baseline={state.baseline[field]}
      intent={state.fields[field]}
      resetKey={state.resetKeys[field]}
      disabled={disabled}
      errorCode={byField[field]}
      onChange={onChange}
      onReady={NO_READY}
      onClear={onClear}
      onUndoClear={onUndoClear}
    />
  ));
}
