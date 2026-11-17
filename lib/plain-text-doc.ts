import type { RichTextDoc } from '@/lib/schemas/rich-text';

/** A text node is capped at 5000 UTF-16 units; 2500 code points never exceed that. */
const CHUNK_CODE_POINTS = 2500;

/** Plain text (already normalised) as a rich-text doc, one paragraph per line; the text is data, never parsed as markup. */
export function plainTextToDoc(text: string): RichTextDoc {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => {
      const points = Array.from(line);
      const chunks: string[] = [];
      for (let at = 0; at < points.length; at += CHUNK_CODE_POINTS)
        chunks.push(points.slice(at, at + CHUNK_CODE_POINTS).join(''));
      return {
        type: 'paragraph' as const,
        ...(chunks.length
          ? {
              content: chunks.map((chunk) => ({
                type: 'text' as const,
                text: chunk,
              })),
            }
          : {}),
      };
    }),
  };
}
