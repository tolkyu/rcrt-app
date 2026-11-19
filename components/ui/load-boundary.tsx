'use client';

import { Component, type ReactNode } from 'react';

/** Catches a failed lazy chunk (e.g. a tab older than the last deploy) and shows `fallback` instead of crashing the shell. */
export class LoadBoundary extends Component<
  { fallback: ReactNode; onError?: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError?.();
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
