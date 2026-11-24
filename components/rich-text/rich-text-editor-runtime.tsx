'use client';

import { useEffect, useImperativeHandle, useRef } from 'react';
import { mergeAttributes } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
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
import { UndoRedo } from '@tiptap/extensions/undo-redo';
import { EditorState } from '@tiptap/pm/state';
import {
  parseEditorDocument,
  toEditorDocument,
} from '@/lib/rich-text-editor-document';
import { cn } from '@/lib/utils';
import type { RichTextEditorProps } from './rich-text-editor';
import { RichTextToolbar } from './rich-text-toolbar';
import { safeEditorLink } from './rich-text-link-dialog';
import {
  RICH_TEXT_FIELD_HEIGHT,
  RICH_TEXT_TYPOGRAPHY,
} from './rich-text-typography';

const extensions = [
  Document,
  Text,
  Paragraph,
  // The tag stays h1-h3 so copy and paste keep the level; aria-level places it under the page h1 (P9).
  Heading.extend({
    renderHTML({ node, HTMLAttributes }) {
      const level = Number(node.attrs.level);
      return [
        `h${level}`,
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          'aria-level': level + 1,
        }),
        0,
      ];
    },
  }).configure({ levels: [1, 2, 3] }),
  BulletList,
  OrderedList,
  ListItem.extend({ content: 'paragraph{1,20}' }),
  Bold,
  Italic,
  UndoRedo,
  Link.configure({
    openOnClick: false,
    enableClickSelection: false,
    autolink: false,
    linkOnPaste: false,
    isAllowedUri: (href) => safeEditorLink(href) !== null,
  }),
  HardBreak.extend({
    addKeyboardShortcuts() {
      return { 'Shift-Enter': () => this.editor.commands.setHardBreak() };
    },
  }),
];

export default function RichTextEditorRuntime({
  initialDocument,
  resetKey,
  disabled,
  fieldLabel,
  onChange,
  onReadyChange,
  ref,
  ...control
}: RichTextEditorProps) {
  const ready = useRef(onReadyChange);
  const adopted = useRef(resetKey);
  useEffect(() => {
    ready.current = onReadyChange;
  });
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    content: toEditorDocument(initialDocument),
    editable: !disabled,
    onCreate: ({ editor }) =>
      ready.current(parseEditorDocument(editor.getJSON()).kind === 'valid'),
    onUpdate: ({ editor }) => onChange(parseEditorDocument(editor.getJSON())),
    editorProps: {
      attributes: {
        id: control.id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': control['aria-labelledby'] ?? '',
        'aria-describedby': control['aria-describedby'] ?? '',
        'aria-invalid': String(control['aria-invalid'] ?? false),
        'aria-required': String(control['aria-required'] ?? false),
        class: `flex-1 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring ${RICH_TEXT_TYPOGRAPHY}`,
      },
      handleDOMEvents: {
        keydown: (view, event) =>
          event.key === 'Enter' &&
          (event.ctrlKey || event.metaKey) &&
          !event.isComposing &&
          !view.composing,
        click: (_view, event) => {
          if (!(event.target instanceof Element) || !event.target.closest('a'))
            return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editor?.commands.focus();
      },
    }),
    [editor],
  );
  useEffect(() => () => ready.current(false), []);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);
  useEffect(() => {
    if (!editor || adopted.current === resetKey) return;
    ready.current(false);
    adopted.current = resetKey;
    const target = editor.schema
      .nodeFromJSON(toEditorDocument(initialDocument))
      .toJSON();
    const current = parseEditorDocument(editor.getJSON());
    const replacement = parseEditorDocument(target);
    if (
      replacement.kind === 'valid' &&
      (current.kind !== 'valid' ||
        JSON.stringify(current.document) !==
          JSON.stringify(replacement.document))
    ) {
      editor.commands.setContent(target, { emitUpdate: false });
    }
    const { schema, doc, selection, storedMarks, plugins } = editor.state;
    editor.view.updateState(
      EditorState.create({ schema, doc, selection, storedMarks, plugins }),
    );
    ready.current(parseEditorDocument(editor.getJSON()).kind === 'valid');
  }, [editor, initialDocument, resetKey]);
  return (
    <div
      className={cn(
        'bg-surface flex flex-col rounded-lg border',
        RICH_TEXT_FIELD_HEIGHT,
        control['aria-invalid'] ? 'border-error' : 'border-input',
      )}
    >
      {editor && (
        <RichTextToolbar
          editor={editor}
          disabled={disabled}
          id={control.id}
          fieldLabel={fieldLabel}
        />
      )}
      <EditorContent editor={editor} className="flex flex-1 flex-col" />
    </div>
  );
}
