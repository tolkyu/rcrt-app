import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RICH_TEXT_TYPOGRAPHY } from '@/components/rich-text/rich-text-typography';
import { RichTextView } from '@/components/rich-text/rich-text-view';
import { richTextDocSchema } from '@/lib/schemas/rich-text';

describe('RichTextView', () => {
  it('uses the last validated link when duplicate links would otherwise nest anchors', () => {
    const document = richTextDocSchema.parse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Linked text',
              marks: [
                { type: 'link', attrs: { href: 'https://first.example/' } },
                { type: 'bold' },
                { type: 'link', attrs: { href: 'https://last.example/' } },
              ],
            },
          ],
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(RichTextView, { document }),
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="https://last.example/"');
    expect(html).not.toContain('href="https://first.example/"');
    expect(html).toContain('<strong>Linked text</strong>');
  });
  it('renders validated content using semantic elements and escaped text', () => {
    const document = richTextDocSchema.parse({
      type: 'doc',
      content: [
        ...[1, 2, 3].map((level) => ({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: `Heading ${level}` }],
        })),
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '<script>alert(1)</script>',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
            { type: 'hardBreak' },
            {
              type: 'text',
              text: 'Website',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://example.com/?a=1&b=2' },
                },
              ],
            },
            {
              type: 'text',
              text: 'Email',
              marks: [
                { type: 'link', attrs: { href: 'mailto:team@example.com' } },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 12 },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Ordered item' }],
                },
              ],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Bullet item' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(RichTextView, { document }),
    );
    for (const level of [1, 2, 3]) expect(html).toContain(`<h${level} `);
    expect(html).toContain(
      '<em><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></em>',
    );
    expect(html).toContain('<br/>');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('href="mailto:team@example.com"');
    expect(html).toContain('<ol start="12"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).not.toContain('<script>');
  });

  it('shares the editor typography and offsets heading levels without changing the tag', () => {
    const document = richTextDocSchema.parse({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Роль' }],
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(RichTextView, { document, headingOffset: 3 }),
    );
    expect(html).toContain('<h1 aria-level="4">');
    expect(html).toContain(RICH_TEXT_TYPOGRAPHY.replaceAll('&', '&amp;'));
    expect(RICH_TEXT_TYPOGRAPHY).toContain('[&_a]:text-link');
    expect(RICH_TEXT_TYPOGRAPHY).not.toContain('text-primary');
  });

  it('preserves absence versus an empty editable paragraph', () => {
    expect(
      renderToStaticMarkup(createElement(RichTextView, { document: null })),
    ).toBe('');
    const document = richTextDocSchema.parse({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expect(
      renderToStaticMarkup(createElement(RichTextView, { document })),
    ).toContain('<p>');
  });

  it('preserves selectable whitespace and applies the caller layout class', () => {
    const document = richTextDocSchema.parse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '  Досвід\n роботи 😀' }],
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(RichTextView, { document, className: 'max-w-full' }),
    );
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain('[overflow-wrap:anywhere]');
    expect(html).toContain('max-w-full');
    expect(html).toContain('  Досвід\n роботи 😀');
  });
});
