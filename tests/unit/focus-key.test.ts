// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusByKey } from '@/components/positions/focus-key';

const frames: Array<() => void> = [];
const nextFrame = () => frames.shift()?.();

const mark = (key: string, visible = true, tag = 'button') => {
  const element = document.createElement(tag);
  element.setAttribute('data-focus-key', key);
  element.tabIndex = -1;
  // jsdom has no layout, so visibility is declared per element.
  element.getClientRects = () =>
    (visible ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
  document.body.append(element);
  return element;
};

beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    frames.push(callback),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('focusByKey [wireframe §5 focus restore]', () => {
  it('skips the hidden twin that table and cards both render and focuses the visible one', () => {
    const hidden = mark('toggle:1', false);
    const visible = mark('toggle:1');
    focusByKey('toggle:1');
    expect(document.activeElement).toBe(visible);
    expect(document.activeElement).not.toBe(hidden);
    expect(frames).toHaveLength(0);
  });

  it('retries on the next frame until a target that is still disabled becomes enabled', () => {
    const button = mark('toggle:2') as HTMLButtonElement;
    button.disabled = true;
    focusByKey('toggle:2');
    expect(document.activeElement).not.toBe(button);
    expect(frames).toHaveLength(1);
    button.disabled = false;
    nextFrame();
    expect(document.activeElement).toBe(button);
    expect(frames).toHaveLength(0);
  });

  it('retries until a target that renders later appears', () => {
    focusByKey('name:3');
    expect(frames).toHaveLength(1);
    const row = mark('name:3', true, 'th');
    nextFrame();
    expect(document.activeElement).toBe(row);
    expect(frames).toHaveLength(0);
  });

  it('gives up after ten retries when the target never appears', () => {
    mark('toggle:other');
    focusByKey('toggle:missing');
    let retries = 0;
    while (frames.length > 0) {
      nextFrame();
      retries += 1;
    }
    expect(retries).toBe(10);
    expect(document.activeElement).toBe(document.body);
  });
});
