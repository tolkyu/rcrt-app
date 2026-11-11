// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOpenerFocus } from '@/components/ui/use-opener-focus';
import { lastFocusedElement, trackLastFocus } from '@/lib/last-focus';

afterEach(() => {
  document.body.innerHTML = '';
});

const cancelable = () => new Event('focus', { cancelable: true });

function button(label: string) {
  const element = document.createElement('button');
  element.textContent = label;
  document.body.append(element);
  return element;
}

describe('last focused element [UI foundation F8, WCAG 2.4.3]', () => {
  it('survives the blur that hiding the opener causes, so a lazily mounted modal still finds it', () => {
    trackLastFocus();
    trackLastFocus();
    const opener = button('Створити');
    opener.focus();
    expect(lastFocusedElement()).toBe(opener);
    // A Suspense boundary hides the opener while the chunk loads; focus falls to <body>.
    opener.blur();
    expect(document.activeElement).toBe(document.body);

    const { result } = renderHook(() => useOpenerFocus({}));
    result.current.onOpenAutoFocus(cancelable());
    const close = cancelable();
    result.current.onCloseAutoFocus(close);
    expect(document.activeElement).toBe(opener);
    expect(close.defaultPrevented).toBe(true);
  });

  it('prefers the element that holds focus when the modal mounts', () => {
    trackLastFocus();
    const stale = button('Старе');
    const current = button('Поточне');
    stale.focus();
    current.focus();
    const { result } = renderHook(() => useOpenerFocus({}));
    result.current.onOpenAutoFocus(cancelable());
    stale.focus();
    result.current.onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(current);
  });

  it('does not focus a remembered element that left the page', () => {
    trackLastFocus();
    const gone = button('Зникло');
    gone.focus();
    gone.blur();
    const { result } = renderHook(() => useOpenerFocus({}));
    result.current.onOpenAutoFocus(cancelable());
    gone.remove();
    const close = cancelable();
    result.current.onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(false);
  });
});
