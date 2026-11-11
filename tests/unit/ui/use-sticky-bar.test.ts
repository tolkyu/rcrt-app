// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyBar } from '@/lib/use-sticky-bar';

const PROPERTY = '--sticky-bar-bottom';
const root = () => document.documentElement.style.getPropertyValue(PROPERTY);

let height = 0;
let resize: () => void = () => undefined;
const observers: { disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  height = 48;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn();
      constructor(callback: () => void) {
        resize = callback;
        observers.push(this);
      }
      observe() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    () => height,
  );
});
afterEach(() => {
  cleanup();
  observers.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Bar({ gap }: { gap?: number }) {
  return createElement('div', { ref: useStickyBar(gap) });
}

describe('useStickyBar [UI foundation F7]', () => {
  it('publishes the bar height plus its gap on <html> while mounted and removes it on unmount', () => {
    const { unmount } = render(createElement(Bar, { gap: 8 }));
    expect(root()).toBe('56px');
    unmount();
    expect(root()).toBe('');
    expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('follows the bar when it grows and reserves nothing while it is hidden', () => {
    render(createElement(Bar));
    expect(root()).toBe('48px');
    height = 120;
    resize();
    expect(root()).toBe('120px');
    height = 0;
    resize();
    expect(root()).toBe('0px');
  });
});
