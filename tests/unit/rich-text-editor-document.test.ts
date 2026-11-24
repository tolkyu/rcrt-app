// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import HardBreak from '@tiptap/extension-hard-break';
import { richTextDocSchema } from '@/lib/schemas/rich-text';
import {
  parseEditorDocument,
  toEditorDocument,
} from '@/lib/rich-text-editor-document';

const documentWithText = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('editor document boundary', () => {
  it('roundtrips the actual pinned editor output, retaining list starts and formatting', () => {
    const document = richTextDocSchema.parse({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Вимоги' }],
        },
        {
          type: 'orderedList',
          attrs: { start: 7 },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Досвід',
                      marks: [
                        {
                          type: 'link',
                          attrs: { href: 'https://example.com/' },
                        },
                        { type: 'bold' },
                        { type: 'italic' },
                      ],
                    },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'роботи' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const editor = new Editor({
      extensions: [
        Document,
        Text,
        Paragraph,
        Heading.configure({ levels: [1, 2, 3] }),
        BulletList,
        OrderedList,
        ListItem,
        Bold,
        Italic,
        Link,
        HardBreak,
      ],
      content: toEditorDocument(document),
    });
    try {
      expect(parseEditorDocument(editor.getJSON())).toEqual({
        kind: 'valid',
        document,
      });
    } finally {
      editor.destroy();
    }
  });

  it('keeps absence distinct from an edited empty paragraph', () => {
    const empty = toEditorDocument(null);
    expect(parseEditorDocument(empty)).toEqual({
      kind: 'valid',
      document: empty,
    });
    expect(parseEditorDocument(null)).toMatchObject({
      kind: 'invalid',
      input: null,
    });
  });

  it('splits long text at Unicode boundaries without losing marks or whitespace', () => {
    const text = ' '.repeat(4999) + '😀' + 'і'.repeat(5000);
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text, marks: [{ type: 'bold' }] }],
        },
      ],
    };
    const result = parseEditorDocument(input);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') throw new Error('Expected a valid document');
    const paragraph = result.document.content[0];
    if (paragraph?.type !== 'paragraph')
      throw new Error('Expected a paragraph');
    expect(
      paragraph.content
        ?.map((node) => (node.type === 'text' ? node.text : ''))
        .join(''),
    ).toBe(text);
    expect(
      paragraph.content?.map((node) =>
        node.type === 'text' ? node.text.length : 0,
      ),
    ).toEqual([4999, 5000, 2]);
    expect(
      paragraph.content?.every(
        (node) => node.type === 'text' && node.marks?.[0]?.type === 'bold',
      ),
    ).toBe(true);
  });

  it.each([
    [
      'unsafe link',
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [
              {
                type: 'link',
                attrs: { href: 'javascript:alert(1)', target: '_blank' },
              },
            ],
          },
        ],
      },
    ],
    [
      'unsupported node',
      { type: 'image', attrs: { src: 'https://example.com/image' } },
    ],
    [
      'unsupported mark',
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'text', marks: [{ type: 'strike' }] }],
      },
    ],
    [
      'unsupported attributes',
      { type: 'paragraph', attrs: { onclick: 'alert(1)' } },
    ],
    ['heading level', { type: 'heading', attrs: { level: 4 } }],
    [
      'nested list',
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'bulletList', content: [] }] },
        ],
      },
    ],
  ])('refuses %s and retains the exact original input', (_label, block) => {
    const input = { type: 'doc', content: [block] };
    const result = parseEditorDocument(input);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') throw new Error('Expected invalid input');
    expect(result.input).toBe(input);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it.each([
    documentWithText('x'.repeat(50_001)),
    {
      type: 'doc',
      content: Array.from({ length: 201 }, () => ({ type: 'paragraph' })),
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: Array.from({ length: 501 }, () => ({ type: 'hardBreak' })),
        },
      ],
    },
  ])('keeps the server size and structure limits authoritative', (input) => {
    expect(parseEditorDocument(input)).toMatchObject({
      kind: 'invalid',
      input,
    });
  });

  it('normalizes only known editor attributes, retaining canonical link validation', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Email',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'mailto:team@example.com',
                    target: '_blank',
                    rel: 'noopener',
                    class: null,
                    title: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseEditorDocument(input)).toMatchObject({ kind: 'valid' });
    expect(input.content[0]?.content[0]?.marks[0]?.attrs).toHaveProperty(
      'target',
      '_blank',
    );
  });
});
