'use client';

import { Fragment, useRef, useState, type KeyboardEvent } from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import {
  Bold,
  CornerDownLeft,
  Ellipsis,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useMobile } from '@/lib/use-mobile';
import { cn } from '@/lib/utils';
import { RichTextLinkDialog, type LinkEntry } from './rich-text-link-dialog';

const ICONS = {
  bold: Bold,
  italic: Italic,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  hardBreak: CornerDownLeft,
  link: Link2,
} as const satisfies Record<string, LucideIcon>;
type Command = keyof typeof ICONS;
type ToolbarKey = Command | 'more';

const DESKTOP_GROUPS: readonly (readonly Command[])[] = [
  ['bold', 'italic'],
  ['heading1', 'heading2', 'heading3'],
  ['bulletList', 'orderedList'],
  ['hardBreak', 'link'],
];
const PHONE_MAIN: readonly Command[] = [
  'bold',
  'italic',
  'heading2',
  'bulletList',
  'link',
];
const PHONE_MORE: readonly Command[] = [
  'heading1',
  'heading3',
  'orderedList',
  'hardBreak',
];

const CONTROL =
  'relative p-0 transition-none focus-visible:-outline-offset-2 aria-disabled:bg-transparent aria-pressed:bg-primary-subtle aria-pressed:text-link';
const CONTROL_SIZE = {
  phone: 'h-11 w-full',
  desktop: 'size-8 pointer-coarse:size-11',
};

export function RichTextToolbar({
  editor,
  disabled,
  id,
  fieldLabel,
}: {
  editor: Editor;
  disabled: boolean;
  id: string;
  fieldLabel: string;
}) {
  const t = useTranslations('richText');
  const mobile = useMobile();
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [current, setCurrent] = useState<ToolbarKey>('bold');
  const root = useRef<HTMLDivElement>(null);
  const overflowId = `${id}-toolbar-more`;
  const commands: Record<Command, () => unknown> = {
    bold: () => editor.chain().focus().toggleBold().run(),
    italic: () => editor.chain().focus().toggleItalic().run(),
    heading1: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    heading2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    heading3: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    bulletList: () => editor.chain().focus().toggleBulletList().run(),
    orderedList: () => editor.chain().focus().toggleOrderedList().run(),
    hardBreak: () => editor.chain().focus().setHardBreak().run(),
    link: () => {
      const href = editor.getAttributes('link').href;
      setLinkEntry({
        selection: {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        },
        href: typeof href === 'string' ? href : '',
      });
    },
  };
  const sequence: readonly ToolbarKey[] = mobile
    ? [...PHONE_MAIN, 'more', ...(moreOpen ? PHONE_MORE : [])]
    : DESKTOP_GROUPS.flat();
  const tabStop = sequence.includes(current) ? current : 'bold';
  const size = mobile ? CONTROL_SIZE.phone : CONTROL_SIZE.desktop;
  const moveTo = (key: ToolbarKey) => {
    setCurrent(key);
    root.current
      ?.querySelector<HTMLElement>(`[data-toolbar-key="${key}"]`)
      ?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = sequence.indexOf(tabStop);
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % sequence.length,
      ArrowLeft: (index - 1 + sequence.length) % sequence.length,
      Home: 0,
      End: sequence.length - 1,
    };
    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      moveTo(sequence[target] ?? 'bold');
    } else if (event.key === 'Escape' && mobile && moreOpen) {
      event.preventDefault();
      moveTo('more');
      setMoreOpen(false);
    }
  };
  const renderCommand = (key: Command) => {
    const Icon = ICONS[key];
    const label = t(key);
    return (
      <Tooltip key={key} content={label} decorative>
        <Button
          variant="ghost"
          size="sm"
          data-toolbar-key={key}
          tabIndex={key === tabStop ? 0 : -1}
          aria-label={label}
          aria-disabled={disabled || undefined}
          aria-pressed={key === 'hardBreak' ? undefined : state[key]}
          aria-haspopup={key === 'link' ? 'dialog' : undefined}
          className={cn(CONTROL, size)}
          onFocus={() => setCurrent(key)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!editor.view.composing && !disabled) commands[key]();
          }}
        >
          <Icon aria-hidden="true" />
        </Button>
      </Tooltip>
    );
  };
  const hiddenActive = state.heading1 || state.heading3 || state.orderedList;
  const moreLabel = t(hiddenActive ? 'moreActive' : 'more');
  // An already open row must stay closable after the toolbar locks.
  const moreLocked = disabled && !moreOpen;
  return (
    <>
      <div
        ref={root}
        role="toolbar"
        aria-controls={id}
        aria-label={t('toolbarFor', { field: fieldLabel })}
        onKeyDown={onKeyDown}
        className={cn(
          'border-border border-b p-1',
          mobile
            ? 'grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-0.5 min-[20rem]:grid-cols-6'
            : 'flex flex-wrap items-center gap-0.5',
        )}
      >
        {mobile ? (
          <>
            {PHONE_MAIN.map(renderCommand)}
            <Tooltip content={moreLabel} decorative>
              <Button
                variant="ghost"
                size="sm"
                data-toolbar-key="more"
                tabIndex={tabStop === 'more' ? 0 : -1}
                aria-label={moreLabel}
                aria-expanded={moreOpen}
                aria-controls={overflowId}
                aria-disabled={moreLocked || undefined}
                className={cn(CONTROL, size, 'aria-expanded:bg-surface-muted')}
                onFocus={() => setCurrent('more')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!moreLocked) setMoreOpen((open) => !open);
                }}
              >
                <Ellipsis aria-hidden="true" />
                {hiddenActive && (
                  <span
                    aria-hidden="true"
                    className="bg-brand absolute top-1.5 right-1.5 size-1.5 rounded-full"
                  />
                )}
              </Button>
            </Tooltip>
            <div id={overflowId} className={moreOpen ? 'contents' : 'hidden'}>
              {moreOpen && PHONE_MORE.map(renderCommand)}
            </div>
          </>
        ) : (
          DESKTOP_GROUPS.map((group, index) => (
            <Fragment key={group[0]}>
              {index > 0 && (
                <span aria-hidden="true" className="bg-border mx-1 h-5 w-px" />
              )}
              {group.map(renderCommand)}
            </Fragment>
          ))
        )}
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
