import { Fragment, type ReactNode } from 'react';
import type { RichTextDoc } from '@/lib/schemas/rich-text';
import { cn } from '@/lib/utils';
import { RICH_TEXT_TYPOGRAPHY } from './rich-text-typography';

type Block = RichTextDoc['content'][number];
type Paragraph = Extract<Block, { type: 'paragraph' }>;
type Inline = NonNullable<Paragraph['content']>[number];

function renderInline(node: Inline): ReactNode {
  if (node.type === 'hardBreak') return <br />;
  let content: ReactNode = node.text;
  const marks = node.marks ?? [];
  const lastLink = marks.findLastIndex((mark) => mark.type === 'link');
  for (const [index, mark] of marks.entries()) {
    switch (mark.type) {
      case 'bold':
        content = <strong>{content}</strong>;
        break;
      case 'italic':
        content = <em>{content}</em>;
        break;
      case 'link':
        if (index !== lastLink) break;
        content = <a href={mark.attrs.href}>{content}</a>;
        break;
      default: {
        const exhaustive: never = mark;
        return exhaustive;
      }
    }
  }
  return content;
}

function renderBlock(node: Block, headingOffset: number): ReactNode {
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const content = node.content?.map((inline, index) => (
        <Fragment key={index}>{renderInline(inline)}</Fragment>
      ));
      if (node.type === 'paragraph') return <p>{content}</p>;
      const ariaLevel = node.attrs.level + headingOffset;
      switch (node.attrs.level) {
        case 1:
          return <h1 aria-level={ariaLevel}>{content}</h1>;
        case 2:
          return <h2 aria-level={ariaLevel}>{content}</h2>;
        case 3:
          return <h3 aria-level={ariaLevel}>{content}</h3>;
      }
      return null;
    }
    case 'bulletList':
    case 'orderedList': {
      const items = node.content.map((item, index) => (
        <li key={index}>
          {item.content.map((paragraph, paragraphIndex) => (
            <Fragment key={paragraphIndex}>
              {renderBlock(paragraph, headingOffset)}
            </Fragment>
          ))}
        </li>
      ));
      return node.type === 'bulletList' ? (
        <ul>{items}</ul>
      ) : (
        <ol start={node.attrs?.start}>{items}</ol>
      );
    }
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

/** `headingOffset` is the outline level of the surrounding section: document headings are announced below it and keep their look (P9). */
export function RichTextView({
  document,
  className,
  headingOffset = 1,
}: {
  document: RichTextDoc | null;
  className?: string;
  headingOffset?: number;
}) {
  if (document === null) return null;
  return (
    <div className={cn(RICH_TEXT_TYPOGRAPHY, className)}>
      {document.content.map((node, index) => (
        <Fragment key={index}>{renderBlock(node, headingOffset)}</Fragment>
      ))}
    </div>
  );
}
