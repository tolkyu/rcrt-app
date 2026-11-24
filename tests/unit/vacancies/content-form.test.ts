import { describe, expect, it } from 'vitest';
import { parseEditorDocument } from '@/lib/rich-text-editor-document';
import {
  baselineContent,
  changeContent,
  clearContent,
  contentDirty,
  emptyContentFields,
  fieldDocument,
  invalidContentFields,
  undoContentClear,
} from '@/lib/vacancy-content-form';
import { buildContentPatch } from '@/lib/vacancy-content-submit';
import { vacancyContentReadSchema } from '@/lib/schemas/vacancy-content';

const doc = (text = 'New document') => ({
  type: 'doc' as const,
  content: [
    { type: 'paragraph' as const, content: [{ type: 'text' as const, text }] },
  ],
});
const baseline = baselineContent(
  vacancyContentReadSchema.parse({
    id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    version: 5,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: doc('Saved'),
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
  }),
);
describe('content intent and strict diff [ADR-020]', () => {
  it('an untouched document and NULL have no patch', () => {
    expect(buildContentPatch(baseline, emptyContentFields())).toEqual({
      kind: 'empty',
    });
    expect(contentDirty(baseline, emptyContentFields())).toBe(false);
    expect(baseline).not.toHaveProperty('canEditContent');
  });
  it('a deliberate empty document replaces NULL without clearing to NULL', () => {
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
    const fields = changeContent(
      baseline,
      emptyContentFields(),
      'requirementsDoc',
      parseEditorDocument(empty),
    );
    expect(buildContentPatch(baseline, fields)).toEqual({
      kind: 'patch',
      body: { expectedVersion: 5, requirementsDoc: empty },
    });
  });
  it('a valid replacement matching the saved document becomes unchanged', () => {
    const fields = changeContent(
      baseline,
      emptyContentFields(),
      'descriptionDoc',
      parseEditorDocument(doc('Saved')),
    );
    expect(fields.descriptionDoc).toEqual({ kind: 'unchanged' });
    expect(buildContentPatch(baseline, fields)).toEqual({ kind: 'empty' });
  });
  it('invalid input stays dirty and blocks the entire patch, including an independent valid field', () => {
    const invalid = parseEditorDocument({
      type: 'doc',
      content: [{ type: 'image' }],
    });
    const fields = changeContent(
      baseline,
      changeContent(
        baseline,
        emptyContentFields(),
        'requirementsDoc',
        parseEditorDocument(doc()),
      ),
      'descriptionDoc',
      invalid,
    );
    expect(contentDirty(baseline, fields)).toBe(true);
    expect(invalidContentFields(fields)).toEqual(['descriptionDoc']);
    expect(
      fieldDocument(baseline, 'descriptionDoc', fields.descriptionDoc),
    ).toBeUndefined();
    expect(buildContentPatch(baseline, fields)).toEqual({
      kind: 'invalid',
      fields: ['descriptionDoc'],
    });
  });
  it('Clear and undo preserve the exact invalid input buffer, including issue details', () => {
    const invalid = parseEditorDocument({
      type: 'unsupported',
      private: 'invalid buffer',
    });
    const fields = changeContent(
      baseline,
      emptyContentFields(),
      'descriptionDoc',
      invalid,
    );
    const cleared = clearContent(fields, 'descriptionDoc');
    expect(buildContentPatch(baseline, cleared)).toEqual({
      kind: 'patch',
      body: { expectedVersion: 5, descriptionDoc: null },
    });
    expect(clearContent(cleared, 'descriptionDoc')).toBe(cleared);
    expect(undoContentClear(cleared, 'descriptionDoc').descriptionDoc).toBe(
      fields.descriptionDoc,
    );
    expect(
      changeContent(
        baseline,
        cleared,
        'descriptionDoc',
        parseEditorDocument(doc()),
      ),
    ).toBe(cleared);
  });
  it('clearing an already absent field is a semantic no-op; undo can still restore its invalid buffer', () => {
    const fields = changeContent(
      baseline,
      emptyContentFields(),
      'requirementsDoc',
      parseEditorDocument('invalid'),
    );
    const cleared = clearContent(fields, 'requirementsDoc');
    expect(buildContentPatch(baseline, cleared)).toEqual({ kind: 'empty' });
    expect(
      invalidContentFields(undoContentClear(cleared, 'requirementsDoc')),
    ).toEqual(['requirementsDoc']);
  });
  it('valid-tagged but unsafe content cannot bypass the shared schema', () => {
    const unsafe = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'text' as const,
              text: 'Link',
              marks: [
                {
                  type: 'link' as const,
                  attrs: { href: 'javascript:alert(1)' },
                },
              ],
            },
          ],
        },
      ],
    };
    const fields = changeContent(
      baseline,
      emptyContentFields(),
      'descriptionDoc',
      { kind: 'valid', document: unsafe },
    );
    expect(buildContentPatch(baseline, fields).kind).toBe('invalid');
  });
});
