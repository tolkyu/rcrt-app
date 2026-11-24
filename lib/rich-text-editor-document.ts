import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';
import { richTextDocSchema, type RichTextDoc } from './schemas/rich-text';

export type EditorDocumentResult =
  | { kind: 'valid'; document: RichTextDoc }
  | { kind: 'invalid'; input: unknown; issues: z.ZodIssue[] };

const editorNodeSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(z.unknown()).optional(),
    content: z.array(z.unknown()).optional(),
  })
  .strict();

function canonicalNodes(input: unknown, depth = 0): unknown[] {
  const parsed = editorNodeSchema.safeParse(input);
  if (!parsed.success || depth > 5) return [input];
  const node = parsed.data;
  if (node.attrs) {
    const attrs = { ...node.attrs };
    if (node.type === 'link') {
      delete attrs.target;
      delete attrs.rel;
      delete attrs.class;
      delete attrs.title;
    }
    if (node.type === 'orderedList') delete attrs.type;
    node.attrs = attrs;
  }
  if (node.content)
    node.content = node.content.flatMap((child) =>
      canonicalNodes(child, depth + 1),
    );
  if (node.marks)
    node.marks = node.marks.flatMap((mark) => canonicalNodes(mark, depth + 1));
  if (node.type !== 'text' || !node.text || node.text.length <= 5000)
    return [node];

  const chunks: unknown[] = [];
  let text = '';
  for (const character of node.text) {
    if (text.length + character.length > 5000) {
      chunks.push({ ...node, text });
      text = '';
    }
    text += character;
  }
  if (text) chunks.push({ ...node, text });
  return chunks;
}

export function parseEditorDocument(input: unknown): EditorDocumentResult {
  const [canonical] = canonicalNodes(input);
  const parsed = richTextDocSchema.safeParse(canonical);
  return parsed.success
    ? { kind: 'valid', document: parsed.data }
    : { kind: 'invalid', input, issues: parsed.error.issues };
}

export function toEditorDocument(document: RichTextDoc | null): JSONContent {
  return document ?? { type: 'doc', content: [{ type: 'paragraph' }] };
}
