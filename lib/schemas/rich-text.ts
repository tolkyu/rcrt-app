import { z } from 'zod';
import { hasOnlyVisibleChars } from '../position-name';

export const RICH_TEXT_MAX_JSON = 50_000;

/** Parsed, not pattern-matched: https or mailto only, no credentials, and the stored form is the normalised `href`. */
function safeLink(value: string): string | null {
  if (!hasOnlyVisibleChars(value) || /\s/.test(value)) return null;
  const url = URL.parse(value);
  if (!url) return null;
  if (url.protocol === 'mailto:') return url.pathname ? url.href : null;
  if (url.protocol !== 'https:' || !url.hostname) return null;
  return url.username || url.password ? null : url.href;
}

const link = z.object({
  type: z.literal('link'),
  attrs: z.object({
    href: z
      .string()
      .max(2048)
      .transform((value, ctx) => {
        const href = safeLink(value);
        if (href === null)
          ctx.addIssue({ code: 'custom', message: 'invalid_link' });
        return href ?? value;
      }),
  }),
});
const mark = z.union([
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  link.strict(),
]);
const text = z
  .object({
    type: z.literal('text'),
    text: z
      .string()
      .min(1)
      .max(5000)
      .refine((value) => hasOnlyVisibleChars(value.replace(/\n/g, ' ')), {
        message: 'invalid_chars',
      }),
    marks: z.array(mark).max(3).optional(),
  })
  .strict();
const hardBreak = z.object({ type: z.literal('hardBreak') }).strict();
const inline = z.union([text, hardBreak]);
const paragraph = z
  .object({
    type: z.literal('paragraph'),
    content: z.array(inline).max(500).optional(),
  })
  .strict();
const heading = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.number().int().min(1).max(3) }).strict(),
    content: z.array(inline).max(500).optional(),
  })
  .strict();
const listItem = z
  .object({
    type: z.literal('listItem'),
    content: z.array(paragraph).min(1).max(20),
  })
  .strict();
const bulletList = z
  .object({
    type: z.literal('bulletList'),
    content: z.array(listItem).min(1).max(100),
  })
  .strict();
const orderedList = z
  .object({
    type: z.literal('orderedList'),
    attrs: z
      .object({ start: z.number().int().min(1).max(9999) })
      .strict()
      .optional(),
    content: z.array(listItem).min(1).max(100),
  })
  .strict();

/** DG-13: ProseMirror JSON limited to an allowlist of nodes and marks, https/mailto links and a size cap; rendered only through React, never as HTML. */
export const richTextDocSchema = z
  .object({
    type: z.literal('doc'),
    content: z
      .array(z.union([paragraph, heading, bulletList, orderedList]))
      .min(1)
      .max(200),
  })
  .strict()
  .refine((doc) => JSON.stringify(doc).length <= RICH_TEXT_MAX_JSON, {
    message: 'too_large',
  })
  .meta({ id: 'RichTextDoc' });
export type RichTextDoc = z.infer<typeof richTextDocSchema>;
