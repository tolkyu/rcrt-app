// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { keepOpenOnToast } from '@/components/ui/toast-guard';
import { cn } from '@/lib/utils';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const css = read('app/globals.css');

describe('z-index scale [UI foundation F7, design-system §3]', () => {
  it('defines modals 40, anchored popups 45 and toasts 50 once', () => {
    expect(css).toContain('--z-dialog: 40;');
    expect(css).toContain('--z-popover: 45;');
    expect(css).toContain('--z-toast: 50;');
    for (const layer of ['dialog', 'popover', 'toast'])
      expect(css).toContain(`@utility z-${layer} {`);
  });

  it('reserves the bottom navigation height for toasts only below the md breakpoint', () => {
    expect(css).toContain('--chrome-bottom: env(safe-area-inset-bottom);');
    expect(css).toMatch(
      /@media \(width < 48rem\) \{\s*:root:has\(\[data-bottom-nav\]\) \{\s*--chrome-bottom: calc\(4rem \+ env\(safe-area-inset-bottom\)\);/,
    );
  });

  it('lets the custom layers win a class conflict like the numeric ones do', () => {
    expect(cn('z-30', 'z-popover')).toBe('z-popover');
    expect(cn('z-dialog', 'z-50')).toBe('z-50');
  });
});

describe('keepOpenOnToast [UI foundation F7]', () => {
  const eventOn = (target: Element) => {
    const event = new Event('pointerdown', { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  };

  it('stops the modal from reading a click on a toast as an outside click', () => {
    document.body.innerHTML =
      '<ol data-sonner-toaster><li><button id="x">×</button></li></ol><div id="page"></div>';
    const next = vi.fn();
    const event = eventOn(document.getElementById('x')!);

    keepOpenOnToast(next)(event);

    expect(event.defaultPrevented).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('leaves every other outside interaction to the caller', () => {
    document.body.innerHTML =
      '<ol data-sonner-toaster></ol><div id="page"></div>';
    const next = vi.fn();
    const event = eventOn(document.getElementById('page')!);

    keepOpenOnToast(next)(event);

    expect(event.defaultPrevented).toBe(false);
    expect(next).toHaveBeenCalledExactlyOnceWith(event);
  });

  it('works without a caller handler', () => {
    document.body.innerHTML = '<div id="page"></div>';
    expect(() =>
      keepOpenOnToast()(eventOn(document.getElementById('page')!)),
    ).not.toThrow();
  });
});
