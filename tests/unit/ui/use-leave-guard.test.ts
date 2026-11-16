// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaveGuard } from '@/components/ui/use-leave-guard';

const { push, replace, router } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { push, replace, router: { push, replace } };
});
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const PAGE = '/vacancies/new';

let pushState: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, '', PAGE);
  pushState = vi.spyOn(window.history, 'pushState');
  back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
  replace.mockReset();
  document.body.innerHTML = '';
});

function anchor(attributes: Record<string, string>) {
  const link = document.createElement('a');
  for (const [name, value] of Object.entries(attributes))
    link.setAttribute(name, value);
  link.textContent = 'link';
  document.body.append(link);
  return link;
}

/** Returns whether the guard cancelled the click; a bubble listener then cancels it for jsdom, which cannot navigate. */
function click(target: Element, init: MouseEventInit = {}) {
  let held = false;
  const settle = (event: Event) => {
    held = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', settle);
  act(() => {
    target.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      }),
    );
  });
  document.removeEventListener('click', settle);
  return held;
}

/** What the browser does on Back: another entry becomes current and `popstate` fires. */
function userBack(url = PAGE) {
  window.history.replaceState({}, '', url);
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

const ownMarker = () =>
  (window.history.state as { __leaveGuard?: string } | null)?.__leaveGuard;

const dirtyGuard = () =>
  renderHook(({ dirty }) => useLeaveGuard(dirty), {
    initialProps: { dirty: true },
  });

describe('useLeaveGuard: a clean form [UI foundation F9]', () => {
  it('installs nothing: no history entry, links and tab close pass', () => {
    const { result } = renderHook(() => useLeaveGuard(false));
    expect(click(anchor({ href: '/vacancies' }))).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
    expect(result.current.asking).toBe(false);
  });
});

describe('useLeaveGuard: a dirty form [UI foundation F9]', () => {
  it('adds one duplicate history entry and asks before tab close', () => {
    dirtyGuard();
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.calls[0]![2]).toBe(window.location.href);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it('marks the duplicate entry so it can be told from any other entry', () => {
    dirtyGuard();
    expect(pushState.mock.calls[0]![0]).toEqual({
      __leaveGuard: expect.any(String),
    });
    expect(ownMarker()).toBeTruthy();
  });

  it('holds an in-app link, then replaces the duplicate with path, query and hash on confirm', () => {
    const { result } = dirtyGuard();
    const link = anchor({ href: '/vacancies?status=OPEN#top' });
    const child = document.createElement('span');
    link.append(child);
    expect(click(child)).toBe(true);
    expect(result.current.asking).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    act(() => result.current.confirm());
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      '/vacancies?status=OPEN#top',
    );
    expect(push).not.toHaveBeenCalled();
    expect(result.current.asking).toBe(false);
  });

  it('pushes instead of replacing when the top entry is no longer the duplicate', () => {
    const { result } = dirtyGuard();
    click(anchor({ href: '/vacancies' }));
    window.history.replaceState({}, '', PAGE);
    act(() => result.current.confirm());
    expect(push).toHaveBeenCalledExactlyOnceWith('/vacancies');
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps the page on stay and does not navigate; the Back trap stays armed', () => {
    const { result } = dirtyGuard();
    click(anchor({ href: '/vacancies' }));
    act(() => result.current.stay());
    expect(result.current.asking).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
    ['right button', { button: 2 }],
  ])('does not hold a %s click', (_name, init) => {
    const { result } = dirtyGuard();
    expect(click(anchor({ href: '/vacancies' }), init)).toBe(false);
    expect(result.current.asking).toBe(false);
  });

  it.each([
    ['opens a new tab', { href: '/vacancies', target: '_blank' }],
    ['opens another frame', { href: '/vacancies', target: 'report' }],
    ['downloads a file', { href: '/files/offer.pdf', download: '' }],
    ['points to another origin', { href: 'https://example.org/page' }],
    ['points to the same page', { href: PAGE }],
    ['only changes the hash of the same page', { href: `${PAGE}#section` }],
    ['has no href', { name: 'anchor' }],
  ])('does not hold a link that %s', (_name, attributes) => {
    const { result } = dirtyGuard();
    expect(click(anchor(attributes))).toBe(false);
    expect(result.current.asking).toBe(false);
  });

  it('holds a link whose target is _self and ignores clicks outside links', () => {
    const { result } = dirtyGuard();
    click(document.body);
    expect(result.current.asking).toBe(false);
    click(anchor({ href: '/candidates', target: '_self' }));
    expect(result.current.asking).toBe(true);
  });

  it('does not hold a click that another capture handler already cancelled', () => {
    const cancel = (event: Event) => event.preventDefault();
    document.addEventListener('click', cancel, true);
    const { result } = dirtyGuard();
    const link = anchor({ href: '/vacancies' });
    click(link);
    document.removeEventListener('click', cancel, true);
    expect(result.current.asking).toBe(false);
  });

  it('turns browser Back into the question once, and confirm goes back for real', () => {
    const { result } = dirtyGuard();
    userBack();
    expect(result.current.asking).toBe(true);
    userBack();
    expect(back).not.toHaveBeenCalled();
    act(() => result.current.confirm());
    expect(back).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);
  });

  it('re-arms the Back trap after stay by pushing a new duplicate entry', () => {
    const { result } = dirtyGuard();
    userBack();
    act(() => result.current.stay());
    expect(pushState).toHaveBeenCalledTimes(2);
    userBack();
    expect(result.current.asking).toBe(true);
  });

  it('lets a pop to another URL stand: no question, no history call, nothing armed', () => {
    const { result, unmount } = dirtyGuard();
    userBack('/candidates');
    expect(result.current.asking).toBe(false);
    userBack(PAGE);
    expect(result.current.asking).toBe(false);
    unmount();
    expect(back).not.toHaveBeenCalled();
  });

  it('ignores a pop that is still on its own duplicate entry', () => {
    const { result } = dirtyGuard();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.asking).toBe(false);
  });
});

describe('useLeaveGuard: lifecycle [UI foundation F9]', () => {
  it('turning clean drops the duplicate entry once and removes every listener', () => {
    const { result, rerender } = dirtyGuard();
    rerender({ dirty: false });
    expect(back).toHaveBeenCalledTimes(1);
    expect(click(anchor({ href: '/vacancies' }))).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    userBack();
    expect(result.current.asking).toBe(false);
  });

  it('unmounting while dirty restores history and removes every listener', () => {
    const { unmount } = dirtyGuard();
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
    expect(click(anchor({ href: '/vacancies' }))).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('does not touch history again when the user already confirmed leaving by Back', () => {
    const { result, unmount } = dirtyGuard();
    userBack();
    act(() => result.current.confirm());
    back.mockClear();
    unmount();
    expect(back).not.toHaveBeenCalled();
  });

  it('does not undo a programmatic navigation made while dirty', () => {
    const { unmount } = dirtyGuard();
    window.history.pushState({}, '', '/vacancies/42');
    unmount();
    expect(back).not.toHaveBeenCalled();
  });

  it('dirty true, false, true within a tick leaves one duplicate and asks nothing', () => {
    const { result, rerender } = dirtyGuard();
    rerender({ dirty: false });
    rerender({ dirty: true });
    expect(back).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(1);
    userBack();
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(ownMarker()).toBeTruthy();
    expect(result.current.asking).toBe(false);
    userBack();
    expect(result.current.asking).toBe(true);
  });

  it('StrictMode mount, cleanup, mount waits for the self-back before pushing again', () => {
    const { result } = renderHook(() => useLeaveGuard(true), {
      wrapper: StrictMode,
    });
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    userBack();
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(result.current.asking).toBe(false);
    userBack();
    expect(result.current.asking).toBe(true);
  });

  it('release disarms without going back; links, tab close and Back pass', () => {
    const { result, unmount } = dirtyGuard();
    act(() => result.current.release());
    expect(click(anchor({ href: '/vacancies' }))).toBe(false);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    userBack('/vacancies');
    expect(result.current.asking).toBe(false);
    unmount();
    expect(back).not.toHaveBeenCalled();
  });

  it('release before the form turns clean never pops the entry that replaced the duplicate', () => {
    const { result, rerender } = dirtyGuard();
    act(() => result.current.release());
    window.history.replaceState({}, '', '/vacancies/42');
    rerender({ dirty: false });
    expect(back).not.toHaveBeenCalled();
  });

  it('stay while the form is clean pushes nothing', () => {
    const { result } = renderHook(() => useLeaveGuard(false));
    act(() => result.current.stay());
    expect(pushState).not.toHaveBeenCalled();
  });
});
