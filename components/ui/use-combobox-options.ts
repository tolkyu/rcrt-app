import { useEffect, useMemo, useRef, useState } from 'react';
import {
  filterOptions,
  SEARCH_DEBOUNCE_MS,
  type ComboboxOption,
  type ComboboxProps,
  type ComboboxStatus,
} from './combobox-shared';

interface Settled {
  key: string;
  found?: readonly ComboboxOption[];
}

const NO_OPTIONS: readonly ComboboxOption[] = [];

/** Local mode filters on every keystroke; async mode debounces, aborts the superseded request and keeps a failed search retryable. */
export function useComboboxOptions(
  source: {
    options?: ComboboxProps['options'];
    onSearch?: ComboboxProps['onSearch'];
  },
  query: string,
  enabled: boolean,
): {
  options: readonly ComboboxOption[];
  status: ComboboxStatus;
  retry: (() => void) | null;
} {
  const { options, onSearch } = source;
  const latestSearch = useRef(onSearch);
  useEffect(() => {
    latestSearch.current = onSearch;
  });
  const trimmed = query.trim();
  const [term, setTerm] = useState(trimmed);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [session, setSession] = useState({ searching: false, count: 0 });
  const searching = enabled && onSearch !== undefined;
  if (session.searching !== searching) {
    // Every open starts a new session: an earlier answer or error is never shown as current.
    setSession({ searching, count: session.count + (searching ? 1 : 0) });
    if (searching) setTerm(trimmed);
  }
  const key = `${session.count}:${attempt}:${term}`;

  useEffect(() => {
    const id = setTimeout(() => setTerm(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [trimmed]);

  useEffect(() => {
    const search = latestSearch.current;
    if (!searching || !search) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() => search(term, controller.signal))
      .then(
        (found) => {
          if (!controller.signal.aborted) setSettled({ key, found });
        },
        () => {
          if (!controller.signal.aborted) setSettled({ key });
        },
      );
    return () => controller.abort();
  }, [searching, term, key]);

  const local = useMemo(
    () => (options ? filterOptions(options, query) : NO_OPTIONS),
    [options, query],
  );

  if (onSearch === undefined)
    return { options: local, status: 'ready', retry: null };
  const retry = () => setAttempt((current) => current + 1);
  if (settled?.key !== key || term !== trimmed)
    return { options: NO_OPTIONS, status: 'loading', retry };
  if (!settled.found) return { options: NO_OPTIONS, status: 'error', retry };
  return { options: settled.found, status: 'ready', retry };
}
