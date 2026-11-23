'use client';

import { useState } from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { RichTextLinkDialog, type LinkEntry } from './rich-text-link-dialog';

export function RichTextToolbar({
  editor,
  disabled,
  id,
}: {
  editor: Editor;
  disabled: boolean;
  id: string;
}) {
  const t = useTranslations('richText');
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      heading1: editor.isActive('heading', { level: 1 }),
      heading2: editor.isActive('heading', { level: 2 }),
      heading3: editor.isActive('heading', { level: 3 }),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      link: editor.isActive('link'),
    }),
  });
  const [linkEntry, setLinkEntry] = useState<LinkEntry | null>(null);
  const controls = [
    {
      key: 'bold',
      active: state.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      active: state.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    ...([1, 2, 3] as const).map((level) => ({
      key: `heading${level}` as const,
      active: editor.isActive('heading', { level }),
      run: () => editor.chain().focus().toggleHeading({ level }).run(),
    })),
    {
      key: 'bulletList',
      active: state.bulletList,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      active: state.orderedList,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'hardBreak',
      active: false,
      run: () => editor.chain().focus().setHardBreak().run(),
    },
    {
      key: 'link',
      active: state.link,
      run: () => {
        const href = editor.getAttributes('link').href;
        setLinkEntry({
          selection: {
            from: editor.state.selection.from,
            to: editor.state.selection.to,
          },
          href: typeof href === 'string' ? href : '',
        });
      },
    },
  ] satisfies {
    key: keyof typeof state | 'hardBreak';
    active: boolean;
    run: () => unknown;
  }[];
  return (
    <>
      <div
        role="group"
        aria-label={t('toolbar')}
        className="border-border flex min-h-[180px] flex-wrap content-start items-start gap-1 border-b p-2 md:min-h-[88px]"
      >
        {controls.map(({ key, active, run }) => (
          <Button
            key={key}
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-pressed={key === 'hardBreak' ? undefined : active}
            className="h-auto min-h-11 max-w-full px-2 whitespace-normal transition-none"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!editor.view.composing && !disabled) run();
            }}
          >
            {t(key)}
          </Button>
        ))}
      </div>
      {linkEntry && (
        <RichTextLinkDialog
          editor={editor}
          disabled={disabled}
          id={id}
          entry={linkEntry}
          onClose={() => setLinkEntry(null)}
        />
      )}
    </>
  );
}
