import type { EditorDocumentResult } from './rich-text-editor-document';
import type {
  VacancyContent,
  VacancyContentRead,
} from './schemas/vacancy-content';

export const CONTENT_FIELDS = ['descriptionDoc', 'requirementsDoc'] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];
type Buffer =
  { kind: 'unchanged' } | { kind: 'replacement'; result: EditorDocumentResult };
export type ContentIntent = Buffer | { kind: 'clear'; previous: Buffer };
export type ContentFields = Record<ContentField, ContentIntent>;
export type ContentDocs = Pick<VacancyContent, ContentField>;
/** What the create and draft forms read from the lazy content fields at send time; `null` = an invalid field blocks the save and is already shown. */
export interface FormContentHandle {
  collect: () => Partial<ContentDocs> | null;
}
export type ContentFeedback =
  | {
      kind:
        | 'idle'
        | 'saved'
        | 'noOp'
        | 'stale'
        | 'closed'
        | 'forbidden'
        | 'network'
        | 'server'
        | 'rateLimited'
        | 'loadFailed'
        | 'reloadFailed';
    }
  | { kind: 'fields'; errors: readonly { path: string; code: string }[] };
/** One definition of the statuses whose published content may be edited (ADR-018 / D133). */
export const isEditableStatus = (status: VacancyContentRead['status']) =>
  status === 'OPEN' || status === 'ON_HOLD';
export const emptyContentFields = (): ContentFields => ({
  descriptionDoc: { kind: 'unchanged' },
  requirementsDoc: { kind: 'unchanged' },
});
export const sameContent = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export const invalidContentFields = (fields: ContentFields) =>
  CONTENT_FIELDS.filter(
    (key) =>
      fields[key].kind === 'replacement' &&
      fields[key].result.kind === 'invalid',
  );
export function fieldDocument(
  baseline: ContentDocs,
  field: ContentField,
  intent: ContentIntent,
) {
  return intent.kind === 'unchanged'
    ? baseline[field]
    : intent.kind === 'clear'
      ? null
      : intent.result.kind === 'valid'
        ? intent.result.document
        : undefined;
}
export const contentDirty = (baseline: ContentDocs, fields: ContentFields) =>
  CONTENT_FIELDS.some(
    (field) =>
      (fields[field].kind === 'replacement' &&
        fields[field].result.kind === 'invalid') ||
      !sameContent(
        baseline[field],
        fieldDocument(baseline, field, fields[field]),
      ),
  );
export function changeContent(
  baseline: ContentDocs,
  fields: ContentFields,
  field: ContentField,
  result: EditorDocumentResult,
): ContentFields {
  if (fields[field].kind === 'clear') return fields;
  return {
    ...fields,
    [field]:
      result.kind === 'valid' && sameContent(baseline[field], result.document)
        ? { kind: 'unchanged' }
        : { kind: 'replacement', result },
  };
}
/** The documents that differ from `baseline`: omitted keys keep the stored value, `null` clears; an invalid field contributes nothing (callers refuse it first). */
export function contentChanges(
  baseline: ContentDocs,
  fields: ContentFields,
): Partial<ContentDocs> {
  const changes: Partial<ContentDocs> = {};
  for (const field of CONTENT_FIELDS) {
    const document = fieldDocument(baseline, field, fields[field]);
    if (document !== undefined && !sameContent(document, baseline[field]))
      changes[field] = document;
  }
  return changes;
}
export function clearContent(
  fields: ContentFields,
  field: ContentField,
): ContentFields {
  const previous = fields[field];
  return previous.kind === 'clear'
    ? fields
    : { ...fields, [field]: { kind: 'clear', previous } };
}
export const undoContentClear = (
  fields: ContentFields,
  field: ContentField,
): ContentFields => {
  const intent = fields[field];
  return intent.kind === 'clear'
    ? { ...fields, [field]: intent.previous }
    : fields;
};
export function baselineContent(content: VacancyContent): VacancyContent {
  const { id, version, updatedAt, descriptionDoc, requirementsDoc } = content;
  return { id, version, updatedAt, descriptionDoc, requirementsDoc };
}
export const loadContentSubmit = () => import('./vacancy-content-submit');
