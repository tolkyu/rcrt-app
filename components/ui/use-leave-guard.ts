'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { beforeDenialReload } from '@/lib/denial-release';

const MARKER = '__leaveGuard';

export type LeaveGuardHandle = { release: () => void };

type Entry = { [MARKER]?: string } | null;

const ownsEntry = (id: string) =>
  (window.history.state as Entry)?.[MARKER] === id;

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
 * Back is caught by a marked duplicate history entry: popping it keeps the URL and opens the question instead.
 * After a successful save call `release()`, then navigate with `router.replace(target)` so the duplicate is replaced.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const id = useId();
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const armed = useRef(false);
  const pageUrl = useRef('');
  // `history.back()` is async: until its popstate arrives nothing may be pushed or interpreted.
  const selfBack = useRef(false);
  const rearm = useRef<(() => void) | null>(null);
  const teardown = useRef<(() => void) | null>(null);

  const arm = useCallback(() => {
    const push = () => {
      pageUrl.current = window.location.href;
      window.history.pushState(
        { ...(window.history.state as Entry), [MARKER]: id },
        '',
        window.location.href,
      );
      armed.current = true;
    };
    if (selfBack.current) rearm.current = push;
    else push();
  }, [id]);

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
      setLeave(
        () => () => (ownsEntry(id) ? router.replace(href) : router.push(href)),
      );
    };
    const onPopState = () => {
      if (!armed.current || ownsEntry(id)) return;
      armed.current = false;
      // A jump past the form (`history.go(-2)`, another page) cannot be held back; let it stand.
      if (window.location.href !== pageUrl.current) return;
      setLeave(() => () => window.history.back());
    };
    const remove = () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    teardown.current = remove;
    const stopDenialRelease = beforeDenialReload(() => {
      armed.current = false;
      rearm.current = null;
      remove();
    });
    arm();
    return () => {
      stopDenialRelease();
      remove();
      rearm.current = null;
      if (!armed.current) return;
      armed.current = false;
      // Only our own duplicate may be popped; after a programmatic navigation the top entry is someone else's.
      if (!ownsEntry(id)) return;
      selfBack.current = true;
      window.addEventListener(
        'popstate',
        () => {
          selfBack.current = false;
          const pending = rearm.current;
          rearm.current = null;
          pending?.();
        },
        { once: true },
      );
      window.history.back();
    };
  }, [dirty, router, id, arm]);

  const stay = useCallback(() => {
    setLeave(null);
    if (!dirty || armed.current) return;
    arm();
  }, [dirty, arm]);

  const confirm = useCallback(() => {
    armed.current = false;
    setLeave(null);
    leave?.();
  }, [leave]);

  const release = useCallback(() => {
    armed.current = false;
    rearm.current = null;
    teardown.current?.();
  }, []);

  return { asking: leave !== null, stay, confirm, release };
}
