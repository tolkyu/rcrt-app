'use client';

import { useEffect, useRef } from 'react';

/** `busyRef` is set synchronously on the first press (state would only update after the render); `mountedRef` guards late callbacks. */
export function useSubmissionLock() {
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const tryLock = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    return true;
  };
  return { mountedRef, busyRef, tryLock };
}
