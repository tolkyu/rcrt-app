'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

function guardedHref(event: MouseEvent): string | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return null;
  const link = (event.target as Element | null)?.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return null;
  if ((link.target && link.target !== '_self') || link.hasAttribute('download'))
    return null;
  const url = new URL(link.href);
  // Another origin is a full page load, which `beforeunload` already asks about; a hash jump leaves nothing.
  if (url.origin !== window.location.origin) return null;
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  )
    return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * While `dirty`, asks before the page is left by an in-app link, browser Back or closing the tab (F9).
 * Back is caught by a duplicate history entry: popping it keeps the URL and opens the question instead.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      const href = guardedHref(event);
      if (!href) return;
      event.preventDefault();
      setLeave(() => () => router.push(href));
    };
    const onPopState = () => {
      if (!armed.current) return;
      armed.current = false;
      setLeave(() => () => window.history.back());
    };
    window.history.pushState(window.history.state, '', window.location.href);
    armed.current = true;
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      if (armed.current) {
        armed.current = false;
        window.history.back();
      }
    };
  }, [dirty, router]);

  const stay = useCallback(() => {
    setLeave(null);
    if (!dirty || armed.current) return;
    window.history.pushState(window.history.state, '', window.location.href);
    armed.current = true;
  }, [dirty]);

  const confirm = useCallback(() => {
    armed.current = false;
    setLeave(null);
    leave?.();
  }, [leave]);

  return { asking: leave !== null, stay, confirm };
}
