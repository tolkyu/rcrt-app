'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { VacancySummary } from '@/lib/schemas/vacancy';
import type { DraftLeave } from './draft-leave';

type Pending =
  | { readonly kind: 'removed'; readonly focus: string | null }
  | { readonly kind: 'restored' };

/** The title link that is on screen: the table and the card list both stay in the DOM and CSS hides one. */
function focusRowLink(id: string): boolean {
  const link = [
    ...document.querySelectorAll<HTMLAnchorElement>(
      `a[data-vacancy-link="${id}"]`,
    ),
  ].find((candidate) => candidate.offsetParent !== null);
  link?.focus();
  return Boolean(link);
}

/** Selection and focus after a draft leaves the list (spec §6.4): the next row, else the previous, else the results region; a refused publish puts both back. State is kept per draft, because publishes may overlap. */
export function useDraftLeaveHandlers({
  items,
  selectedId,
  select,
  results,
}: {
  items: readonly VacancySummary[];
  selectedId: string | undefined;
  select: (id: string | undefined) => void;
  results: RefObject<HTMLElement | null>;
}): DraftLeave {
  const live = useRef({ items, selectedId });
  const mounted = useRef(false);
  const pending = useRef(new Map<string, Pending>());
  /** Drafts this list took over and has not yet seen settle. */
  const handled = useRef(new Set<string>());
  /** Drafts whose selection moved away. */
  const moved = useRef(new Set<string>());

  useEffect(() => {
    live.current = { items, selectedId };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Runs after the render that dropped (or restored) a row, so the target link exists.
  useEffect(() => {
    for (const [id, target] of pending.current) {
      const present = items.some((item) => item.id === id);
      if (target.kind === 'removed' ? present : !present) continue;
      pending.current.delete(id);
      if (target.kind === 'restored') focusRowLink(id);
      else if (target.focus === null || !focusRowLink(target.focus))
        results.current?.focus();
    }
  }, [items, results]);

  return useMemo(
    () => ({
      removed: (id: string) => {
        // The list may be gone by the time a late answer arrives; the URL then belongs to another page.
        if (!mounted.current) return false;
        const { items: shown, selectedId: current } = live.current;
        // Rows whose publish is also in flight are as good as gone: they are no target.
        const rows = shown.filter(
          (row) =>
            row.id === id || pending.current.get(row.id)?.kind !== 'removed',
        );
        const at = rows.findIndex((row) => row.id === id);
        // A shared `?vacancy=` outside this page: no row here, the caller keeps focus itself.
        if (at < 0) return false;
        const next = rows[at + 1] ?? rows[at - 1];
        if (current === id) {
          moved.current.add(id);
          select(next?.id);
        }
        handled.current.add(id);
        pending.current.set(id, {
          kind: 'removed',
          focus: next?.id ?? null,
        });
        return true;
      },
      restored: (id: string) => {
        if (!mounted.current || !handled.current.delete(id)) return false;
        if (moved.current.delete(id)) select(id);
        pending.current.set(id, { kind: 'restored' });
        return true;
      },
      settled: (id: string) => {
        handled.current.delete(id);
        moved.current.delete(id);
      },
    }),
    [select],
  );
}
