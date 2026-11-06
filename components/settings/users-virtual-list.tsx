'use client';

import {
  defaultRangeExtractor,
  useWindowVirtualizer,
} from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { UserListItem } from '@/lib/schemas/user';
import { useMobile } from '@/lib/use-mobile';

export interface UserVirtualAttributes {
  ref?: (element: HTMLElement | null) => void;
  'data-index'?: number;
  'data-user-index'?: number;
  'aria-rowindex'?: number;
  'aria-setsize'?: number;
  'aria-posinset'?: number;
}

export function UsersVirtualList({
  items,
  header,
  renderDesktop,
  renderMobile,
}: {
  items: readonly UserListItem[];
  header: ReactNode;
  renderDesktop: (
    user: UserListItem,
    attributes: UserVirtualAttributes,
  ) => ReactNode;
  renderMobile: (
    user: UserListItem,
    attributes: UserVirtualAttributes,
  ) => ReactNode;
}) {
  const t = useTranslations('settings.users');
  const mobile = useMobile();
  const parent = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  if (focused !== null && focused >= items.length) setFocused(null);
  if (pendingFocus !== null && pendingFocus >= items.length)
    setPendingFocus(null);
  const virtual = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => (mobile ? 170 : 65),
    overscan: 5,
    scrollMargin: margin,
    getItemKey: (index) => items[index]!.id,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      return focused !== null &&
        focused >= 0 &&
        focused < items.length &&
        !indexes.includes(focused)
        ? [...indexes, focused].sort((a, b) => a - b)
        : indexes;
    },
  });
  const rows = virtual.getVirtualItems();
  useLayoutEffect(() => {
    const element = parent.current!;
    const update = () =>
      setMargin(
        (element.querySelector('tbody, ul') ?? element).getBoundingClientRect()
          .top + window.scrollY,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    virtual.measure();
  }, [mobile, virtual]);
  useLayoutEffect(() => {
    if (pendingFocus === null) return;
    const button = parent.current?.querySelector<HTMLElement>(
      `[data-user-index="${pendingFocus}"] button[data-user-id]`,
    );
    if (button) {
      button.focus({ preventScroll: true });
      setPendingFocus(null);
    }
  }, [pendingFocus, rows]);
  const content: ReactNode[] = [];
  let offset = margin;
  for (const row of rows) {
    const gap = Math.max(0, row.start - offset);
    if (gap)
      content.push(
        mobile ? (
          <li
            key={`space-${row.index}`}
            aria-hidden="true"
            style={{ height: gap }}
          />
        ) : (
          <tr key={`space-${row.index}`} aria-hidden="true">
            <td colSpan={6} style={{ height: gap, padding: 0 }} />
          </tr>
        ),
      );
    const attributes: UserVirtualAttributes = {
      ref: virtual.measureElement,
      'data-index': row.index,
      'data-user-index': row.index,
      ...(mobile
        ? { 'aria-setsize': items.length, 'aria-posinset': row.index + 1 }
        : { 'aria-rowindex': row.index + 2 }),
    };
    content.push(
      (mobile ? renderMobile : renderDesktop)(items[row.index]!, attributes),
    );
    offset = row.end;
  }
  const tail = Math.max(0, virtual.getTotalSize() + margin - offset);
  if (tail)
    content.push(
      mobile ? (
        <li key="tail" aria-hidden="true" style={{ height: tail }} />
      ) : (
        <tr key="tail" aria-hidden="true">
          <td colSpan={6} style={{ height: tail, padding: 0 }} />
        </tr>
      ),
    );
  return (
    <div
      ref={parent}
      data-users-virtual
      onFocusCapture={(event) => {
        const index = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-user-index]',
        )?.dataset.userIndex;
        if (index !== undefined) setFocused(Number(index));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(null);
      }}
      onKeyDownCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-user-index]',
        );
        if (
          !row ||
          !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
        )
          return;
        event.preventDefault();
        const index = Number(row.dataset.userIndex);
        const target =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : Math.max(
                  0,
                  Math.min(
                    items.length - 1,
                    index + (event.key === 'ArrowDown' ? 1 : -1),
                  ),
                );
        virtual.scrollToIndex(target, { align: 'auto' });
        setPendingFocus(target);
      }}
    >
      <p className="sr-only">{t('virtualKeyboardHint')}</p>
      {mobile ? (
        <ul className="divide-border divide-y" aria-label={t('caption')}>
          {content}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-rowcount={items.length + 1}>
            {header}
            <tbody>{content}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
