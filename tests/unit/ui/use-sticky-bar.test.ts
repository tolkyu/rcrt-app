// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOOTER_PROPERTY,
  useStickyBar,
  useStickyFooter,
} from '@/lib/use-sticky-bar';

const PROPERTY = '--sticky-bar-bottom';
const published = (property: string) =>
  document.documentElement.style.getPropertyValue(property);
const root = () => published(PROPERTY);
const footer = () => published(FOOTER_PROPERTY);

let height = 0;
let resize: () => void = () => undefined;
let rect = { top: 700, bottom: 748 };
const observers: { disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  height = 48;
  rect = { top: window.innerHeight - 48, bottom: window.innerHeight };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => rect as DOMRect,
  );
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

const Bar = ({ gap }: { gap?: number }) =>
  createElement('div', { ref: useStickyBar(gap) });
const Footer = ({ inset }: { inset?: string }) =>
  createElement('div', {
    ref: useStickyFooter(),
    style: inset ? { bottom: inset } : undefined,
  });

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

describe('useStickyFooter [UI foundation F9]', () => {
  it('publishes on its own property, leaving the fixed bar one (and the <main> padding it drives) untouched', () => {
    const { unmount } = render(createElement(Footer));
    expect(footer()).toBe('48px');
    expect(root()).toBe('');
    unmount();
    expect(footer()).toBe('');
  });

  it('lifts toasts only while the footer is pinned to the bottom edge', async () => {
    render(createElement(Footer));
    const scrollTo = async (top: number, expected: string) => {
      rect = { top, bottom: top + 48 };
      window.dispatchEvent(new Event('scroll'));
      await vi.waitFor(() => expect(footer()).toBe(expected));
    };
    expect(footer()).toBe('48px');
    await scrollTo(300, '0px');
    await scrollTo(window.innerHeight - 48, '48px');
    await scrollTo(window.innerHeight + 200, '0px');
  });

  it('on a phone the pin is the footer’s own inset above the bottom navigation, not the window edge', async () => {
    render(createElement(Footer, { inset: '64px' }));
    const scrollTo = async (bottom: number, expected: string) => {
      rect = { top: bottom - 48, bottom };
      window.dispatchEvent(new Event('scroll'));
      await vi.waitFor(() => expect(footer()).toBe(expected));
    };
    await scrollTo(window.innerHeight - 64, '48px');
    await scrollTo(window.innerHeight, '48px');
    await scrollTo(window.innerHeight - 120, '0px');
  });

  it('stops listening and removes the property on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(createElement(Footer));
    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(footer()).toBe('');
  });
});
