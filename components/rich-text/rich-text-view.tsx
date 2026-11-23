import { Fragment, type ReactNode } from 'react';
import type { RichTextDoc } from '@/lib/schemas/rich-text';
import { cn } from '@/lib/utils';

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
        content = (
          <a
            className="text-primary underline underline-offset-4"
            href={mark.attrs.href}
          >
            {content}
          </a>
        );
        break;
      default: {
        const exhaustive: never = mark;
        return exhaustive;
      }
    }
  }
  return content;
}

function renderBlock(node: Block): ReactNode {
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const content = node.content?.map((inline, index) => (
        <Fragment key={index}>{renderInline(inline)}</Fragment>
      ));
      if (node.type === 'paragraph')
        return <p className="min-h-6 whitespace-pre-wrap">{content}</p>;
      switch (node.attrs.level) {
        case 1:
          return (
            <h1 className="text-heading-lg font-semibold whitespace-pre-wrap">
              {content}
            </h1>
          );
        case 2:
          return (
            <h2 className="text-lg font-semibold whitespace-pre-wrap">
              {content}
            </h2>
          );
        case 3:
          return (
            <h3 className="font-semibold whitespace-pre-wrap">{content}</h3>
          );
      }
      return null;
    }
    case 'bulletList':
    case 'orderedList': {
      const items = node.content.map((item, index) => (
        <li key={index} className="space-y-2">
          {item.content.map((paragraph, paragraphIndex) => (
            <Fragment key={paragraphIndex}>{renderBlock(paragraph)}</Fragment>
          ))}
        </li>
      ));
      return node.type === 'bulletList' ? (
        <ul className="list-disc space-y-2 pl-6">{items}</ul>
      ) : (
        <ol start={node.attrs?.start} className="list-decimal space-y-2 pl-6">
          {items}
        </ol>
      );
    }
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

export function RichTextView({
  document,
  className,
}: {
  document: RichTextDoc | null;
  className?: string;
}) {
  if (document === null) return null;
  return (
    <div
      className={cn(
        'text-foreground space-y-3 text-base leading-6 [overflow-wrap:anywhere]',
        className,
      )}
    >
      {document.content.map((node, index) => (
        <Fragment key={index}>{renderBlock(node)}</Fragment>
      ))}
    </div>
  );
}
