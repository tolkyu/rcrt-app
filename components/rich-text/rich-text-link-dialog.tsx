'use client';
import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { richTextDocSchema } from '@/lib/schemas/rich-text';

export function safeEditorLink(href: string): string | null {
  const parsed = richTextDocSchema.safeParse({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href } }],
          },
        ],
      },
    ],
  });
  const paragraph = parsed.success ? parsed.data.content[0] : undefined;
  const node =
    paragraph?.type === 'paragraph' ? paragraph.content?.[0] : undefined;
  const mark = node?.type === 'text' ? node.marks?.[0] : undefined;
  return mark?.type === 'link' ? mark.attrs.href : null;
}

export type LinkEntry = {
  selection: { from: number; to: number };
  href: string;
};

export function RichTextLinkDialog({
  editor,
  disabled,
  id,
  entry,
  onClose,
}: {
  editor: Editor;
  disabled: boolean;
  id: string;
  entry: LinkEntry;
  onClose: () => void;
}) {
  const t = useTranslations('richText');
  const [href, setHref] = useState(entry.href);
  const [invalid, setInvalid] = useState(false);
  const apply = (remove = false) => {
    if (disabled || editor.isDestroyed) return;
    const normalized = safeEditorLink(href);
    if (!remove && normalized === null) {
      setInvalid(true);
      return;
    }
    const chain = editor
      .chain()
      .setTextSelection(entry.selection)
      .extendMarkRange('link');
    if (remove) chain.unsetLink().run();
    else if (normalized) chain.setLink({ href: normalized }).run();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        closeLabel={t('close')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.stopPropagation();
            if (
              !event.nativeEvent.isComposing &&
              (event.ctrlKey || event.metaKey)
            )
              event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!editor.isDestroyed)
            editor.chain().focus().setTextSelection(entry.selection).run();
        }}
      >
        <DialogHeader title={t('linkTitle')} subtitle={t('linkHint')} />
        <div className="mt-4 space-y-2">
          <Label htmlFor={`${id}-link`}>{t('linkAddress')}</Label>
          <Input
            id={`${id}-link`}
            value={href}
            disabled={disabled}
            className="md:text-base"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-link-error` : undefined}
            onChange={(event) => {
              setHref(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                event.preventDefault();
                apply();
              }
            }}
          />
          {invalid && (
            <p
              id={`${id}-link-error`}
              role="alert"
              className="text-error-text text-sm"
            >
              {t('invalidLink')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => apply(true)}
          >
            {t('removeLink')}
          </Button>
          <Button disabled={disabled} onClick={() => apply()}>
            {t('applyLink')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
