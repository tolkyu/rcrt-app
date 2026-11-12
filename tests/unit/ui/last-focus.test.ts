// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps its "installed" flag and last element in scope, so each test gets a fresh copy.
async function load() {
  vi.resetModules();
  const [{ useOpenerFocus }, focus] = await Promise.all([
    import('@/components/ui/use-opener-focus'),
    import('@/lib/last-focus'),
  ]);
  return { useOpenerFocus, ...focus };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

const cancelable = () => new Event('focus', { cancelable: true });

function button(label: string) {
  const element = document.createElement('button');
  element.textContent = label;
  document.body.append(element);
  return element;
}

const press = (target: Element) =>
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

describe('last focused element [UI foundation F8, WCAG 2.4.3]', () => {
  it('installs one focusin and one pointerdown listener, however often it is called', async () => {
    const { trackLastFocus } = await load();
    const add = vi.spyOn(document, 'addEventListener');
    trackLastFocus();
    trackLastFocus();
    const names = add.mock.calls.map(([name]) => name);
    expect(names.filter((name) => name === 'focusin')).toHaveLength(1);
    expect(names.filter((name) => name === 'pointerdown')).toHaveLength(1);
  });

  it('survives the blur that hiding the opener causes, so a lazily mounted modal still finds it', async () => {
    const { trackLastFocus, lastFocusedElement, useOpenerFocus } = await load();
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

  it('records a pressed button that the browser never focused (Safari, macOS Firefox)', async () => {
    const { trackLastFocus, lastFocusedElement, useOpenerFocus } = await load();
    trackLastFocus();
    const stale = button('Старе');
    stale.focus();
    const opener = button('Відкрити');
    const icon = document.createElement('span');
    opener.append(icon);
    press(icon);
    expect(lastFocusedElement()).toBe(opener);

    stale.blur();
    const { result } = renderHook(() => useOpenerFocus({}));
    result.current.onOpenAutoFocus(cancelable());
    result.current.onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(opener);
  });

  it('ignores a press on something that is not an opener', async () => {
    const { trackLastFocus, lastFocusedElement } = await load();
    trackLastFocus();
    const opener = button('Відкрити');
    opener.focus();
    const text = document.createElement('p');
    document.body.append(text);
    press(text);
    expect(lastFocusedElement()).toBe(opener);
  });

  it('prefers the element that holds focus when the modal mounts', async () => {
    const { trackLastFocus, useOpenerFocus } = await load();
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

  it('does not focus a remembered element that left the page', async () => {
    const { trackLastFocus, useOpenerFocus } = await load();
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
