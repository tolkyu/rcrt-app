'use client';

import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { useRef, type RefObject } from 'react';
import {
  AUDIT_ACTION_GROUPS,
  type AuditActionGroup,
} from '@/lib/audit-constants';
import { useAuditLabels } from './audit-labels';

export function AuditActionPicker({
  id,
  anchor,
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: readonly string[];
  onSelect: (codes: readonly string[]) => void;
}) {
  const t = useTranslations('settings.audit');
  const labels = useAuditLabels();
  const content = useRef<HTMLDivElement>(null);
  const interactedOutside = useRef(false);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          ref={content}
          id={id}
          aria-label={t('filters.action')}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          className="border-border bg-popover text-popover-foreground z-popover max-h-(--radix-popover-content-available-height) w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border p-2 shadow-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            interactedOutside.current = false;
            const item =
              content.current?.querySelector<HTMLInputElement>(
                'input:checked',
              ) ?? content.current?.querySelector<HTMLInputElement>('input');
            item?.focus({ preventScroll: true });
            /** Max-height and position land after mount, so reveal the focused row on the next frame (WCAG 2.4.11). */
            requestAnimationFrame(() =>
              item?.closest('label')?.scrollIntoView({ block: 'nearest' }),
            );
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!interactedOutside.current) anchor.current?.focus();
          }}
          onInteractOutside={(event) => {
            if (anchor.current?.contains(event.target as Node))
              event.preventDefault();
            else interactedOutside.current = true;
          }}
        >
          {Object.entries(AUDIT_ACTION_GROUPS).map(([group, codes]) => (
            <fieldset key={group} className="min-w-0">
              <legend className="text-muted-foreground px-2 pt-2 text-xs font-medium">
                {t(`actionGroups.${group as AuditActionGroup}`)}
              </legend>
              {codes.map((code) => (
                <label
                  key={code}
                  className="hover:bg-accent flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(code)}
                    onChange={(event) =>
                      onSelect(
                        event.target.checked
                          ? [...value, code]
                          : value.filter((selected) => selected !== code),
                      )
                    }
                    className="accent-primary size-4 shrink-0"
                  />
                  <span className="min-w-0">{labels.action(code)}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
