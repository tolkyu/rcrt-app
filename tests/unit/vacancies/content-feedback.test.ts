import { describe, expect, it } from 'vitest';
import {
  blockKey,
  contentFieldErrors,
  type BlockKey,
} from '@/components/vacancies/vacancy-content-feedback';
import { vacancyContentClientMessages } from '@/lib/i18n/vacancy-content-messages';
import { parseEditorDocument } from '@/lib/rich-text-editor-document';
import {
  emptyContentFields,
  isEditableStatus,
} from '@/lib/vacancy-content-form';
import messages from '@/messages/uk.json';

const copy = messages.vacancies.contentEdit;
const invalid = (document: unknown) => {
  const result = parseEditorDocument(document);
  if (result.kind !== 'invalid')
    throw new Error('expected an invalid document');
  return result;
};
const paragraph = (text: string, marks?: unknown[]) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
    },
  ],
});

describe('content route messages [ADR-020]', () => {
  it('ships only the namespaces the route reads, with contentEdit as the sole vacancies key', () => {
    const picked = vacancyContentClientMessages(messages);
    expect(Object.keys(picked).sort()).toEqual([
      'common',
      'form',
      'richText',
      'states',
      'vacancies',
    ]);
    expect(Object.keys(picked.vacancies)).toEqual(['contentEdit']);
  });
  it('has Ukrainian copy for every block reason, failure and field error', () => {
    const blocks: BlockKey[] = [
      'draft',
      'filled',
      'cancelled',
      'locked',
      'noPermission',
      'permissionLost',
    ];
    for (const key of blocks) expect(copy[key]).toMatch(/[А-Яа-яІіЇїЄє]/);
    expect(Object.keys(copy.errors).sort()).toEqual([
      'invalid',
      'invalid_chars',
      'invalid_link',
      'too_large',
    ]);
    expect(Object.keys(copy.feedback).sort()).toEqual([
      'loadFailed',
      'network',
      'rateLimited',
      'reloadFailed',
      'server',
    ]);
  });
});

describe('content status helpers', () => {
  it.each([
    ['OPEN', true, 'noPermission'],
    ['ON_HOLD', true, 'noPermission'],
    ['DRAFT', false, 'draft'],
    ['FILLED', false, 'filled'],
    ['CANCELLED', false, 'cancelled'],
  ] as const)('%s editable=%s block=%s', (status, editable, block) => {
    expect(isEditableStatus(status)).toBe(editable);
    expect(blockKey(status)).toBe(block);
  });
});

describe('contentFieldErrors', () => {
  const fields = emptyContentFields();
  it('has no error for an untouched form', () => {
    expect(contentFieldErrors(fields, { kind: 'idle' })).toEqual({
      byField: {},
      general: null,
    });
  });
  it.each([
    [
      'link',
      paragraph('x', [{ type: 'link', attrs: { href: 'javascript:1' } }]),
      'invalid_link',
    ],
    ['forbidden characters', paragraph('a\u0000b'), 'invalid_chars'],
    ['unknown node', { type: 'doc', content: [{ type: 'image' }] }, 'invalid'],
  ] as const)(
    'maps a local %s issue to %s without exposing schema text',
    (_name, document, code) => {
      const { byField } = contentFieldErrors(
        {
          ...fields,
          descriptionDoc: { kind: 'replacement', result: invalid(document) },
        },
        { kind: 'idle' },
      );
      expect(byField).toEqual({ descriptionDoc: code });
    },
  );
  it.each([
    ['body.descriptionDoc', 'too_big', { descriptionDoc: 'too_large' }],
    [
      'body.requirementsDoc.content.0',
      'custom',
      { requirementsDoc: 'invalid' },
    ],
    [
      'body.descriptionDoc.content.2.text',
      'invalid_type',
      { descriptionDoc: 'invalid' },
    ],
  ] as const)(
    'routes server path %s to its own field',
    (path, code, byField) => {
      expect(
        contentFieldErrors(fields, {
          kind: 'fields',
          errors: [{ path, code }],
        }),
      ).toEqual({ byField, general: null });
    },
  );
  it.each([
    ['body', 'too_large', 'too_large'],
    ['body.expectedVersion', 'invalid_type', 'invalid'],
    ['body.descriptionDocX', 'custom', 'invalid'],
  ] as const)('keeps %s as a general error', (path, code, general) => {
    expect(
      contentFieldErrors(fields, { kind: 'fields', errors: [{ path, code }] }),
    ).toEqual({ byField: {}, general });
  });
});
