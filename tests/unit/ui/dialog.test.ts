// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createElement,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { menuAutoFocus, useDeferredMenu } from '@/components/ui/deferred-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

afterEach(cleanup);

const dialog = (
  props: Partial<Parameters<typeof DialogContent>[0]> = {},
  children?: ReactElement,
) =>
  createElement(Dialog, {
    open: true,
    children: createElement(
      DialogContent,
      { closeLabel: 'Закрити', ...props },
      children ?? createElement(DialogHeader, { title: 'Діалог' }),
    ),
  });

const content = () =>
  document.querySelector<HTMLElement>('[data-slot$="-content"]') as HTMLElement;

const classes = (element: Element) => element.className.split(/\s+/);

describe('Dialog sizes [UI foundation F8, G16]', () => {
  it.each([
    ['sm', 'md:w-[min(28rem,calc(100vw-2rem))]'],
    ['md', 'md:w-[min(36rem,calc(100vw-2rem))]'],
    ['lg', 'md:w-[min(48rem,calc(100vw-2rem))]'],
  ] as const)('size %s sets the desktop width', (size, width) => {
    render(dialog({ size }));
    expect(classes(content())).toContain(width);
  });

  it('defaults to the small width the existing call sites rely on', () => {
    render(dialog());
    expect(classes(content())).toContain('md:w-[min(28rem,calc(100vw-2rem))]');
  });

  it('lets a caller class replace the width', () => {
    render(dialog({ className: 'md:w-[min(44rem,calc(100vw-2rem))]' }));
    expect(classes(content())).toContain('md:w-[min(44rem,calc(100vw-2rem))]');
    expect(classes(content())).not.toContain(
      'md:w-[min(28rem,calc(100vw-2rem))]',
    );
  });

  it('uses radius 16 on desktop, a top-rounded bottom sheet below 768 px', () => {
    render(dialog());
    expect(classes(content())).toEqual(
      expect.arrayContaining(['md:rounded-xl', 'rounded-t-2xl', 'bottom-0']),
    );
  });

  it('slides as a sheet below 768 px and scales in from the centre from 768 px, over a fading overlay', () => {
    render(dialog());
    expect(classes(content())).toEqual(
      expect.arrayContaining(['max-md:motion-sheet-up', 'md:motion-modal']),
    );
    expect(document.querySelector('.motion-fade')).not.toBeNull();
  });

  it('keeps the overlay heavier in dark mode', () => {
    render(dialog());
    expect(classes(document.querySelector('.motion-fade') as Element)).toEqual(
      expect.arrayContaining(['bg-black/40', 'dark:bg-black/60']),
    );
  });
});

describe('DialogHeader and DialogFooter [UI foundation F8]', () => {
  it('names the dialog by the title and describes it by the subtitle', () => {
    render(
      dialog(
        {},
        createElement(DialogHeader, {
          title: 'Запросити користувача',
          subtitle: 'Надішліть запрошення',
        }),
      ),
    );
    const modal = screen.getByRole('dialog', {
      name: 'Запросити користувача',
    });
    expect(
      document.getElementById(modal.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toBe('Надішліть запрошення');
  });

  it('renders the icon as a decorative tile and omits it when absent', () => {
    const { unmount } = render(
      dialog(
        {},
        createElement(DialogHeader, {
          title: 'З іконкою',
          icon: createElement('svg', { 'data-testid': 'icon' }),
        }),
      ),
    );
    const tile = screen.getByTestId('icon').parentElement;
    expect(tile?.getAttribute('aria-hidden')).toBe('true');
    expect(classes(tile as Element)).toContain('bg-primary-subtle');
    unmount();
    render(dialog());
    expect(screen.queryByTestId('icon')).toBeNull();
  });

  it('lets footer buttons wrap long labels and the desktop row wrap with them', () => {
    render(createElement(DialogFooter, { id: 'wrap' }));
    expect(classes(document.getElementById('wrap') as HTMLElement)).toEqual(
      expect.arrayContaining([
        'md:flex-wrap',
        '[&>button]:min-h-12',
        '[&>button]:whitespace-normal',
      ]),
    );
  });

  it('stacks the footer full-width on mobile and right-aligns it on desktop, for both dialog kinds', () => {
    render(
      createElement(
        'div',
        null,
        createElement(DialogFooter, { id: 'dialog' }),
        createElement(AlertDialogFooter, { id: 'alert' }),
      ),
    );
    for (const id of ['dialog', 'alert']) {
      expect(classes(document.getElementById(id) as HTMLElement)).toEqual(
        expect.arrayContaining([
          'flex-col',
          'md:flex-row',
          'md:justify-end',
          '[&>button]:h-auto',
        ]),
      );
    }
  });
});

describe('AlertDialog overlay [UI foundation F8]', () => {
  const alert = (onOverlayPress?: () => void, onOpenChange = () => undefined) =>
    createElement(AlertDialog, {
      open: true,
      onOpenChange,
      children: createElement(
        AlertDialogContent,
        { 'aria-describedby': undefined, onOverlayPress },
        createElement(AlertDialogTitle, null, 'Підтвердження'),
      ),
    });

  it('does not close on an overlay press unless the caller opts in', async () => {
    const onOpenChange = vi.fn();
    render(alert(undefined, onOpenChange));
    await userEvent.click(document.querySelector('.motion-fade') as Element);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('reports an overlay press to a caller that opted in', async () => {
    const onOverlayPress = vi.fn();
    render(alert(onOverlayPress));
    await userEvent.click(document.querySelector('.motion-fade') as Element);
    expect(onOverlayPress).toHaveBeenCalledOnce();
  });
});

describe('modal layering [UI foundation F7/F8]', () => {
  it('puts Dialog, AlertDialog and Sheet on z-dialog and the dropdown on z-popover, below toasts', () => {
    render(dialog());
    expect(classes(content())).toContain('z-dialog');
    cleanup();
    render(
      createElement(AlertDialog, {
        open: true,
        children: createElement(
          AlertDialogContent,
          { 'aria-describedby': undefined },
          createElement(AlertDialogTitle, null, 'Підтвердження'),
        ),
      }),
    );
    expect(classes(content())).toContain('z-dialog');
    cleanup();
    render(
      createElement(Sheet, {
        open: true,
        children: createElement(
          SheetContent,
          { closeLabel: 'Закрити', 'aria-describedby': undefined },
          createElement(SheetTitle, null, 'Шторка'),
        ),
      }),
    );
    expect(classes(content())).toContain('z-dialog');
    cleanup();
    render(
      createElement(DropdownMenu, {
        open: true,
        children: [
          createElement(DropdownMenuTrigger, { key: 'trigger' }, 'Меню'),
          createElement(
            DropdownMenuContent,
            { key: 'content' },
            createElement(DropdownMenuItem, null, 'Пункт'),
          ),
        ],
      }),
    );
    expect(classes(content())).toEqual(
      expect.arrayContaining(['z-popover', 'motion-pop']),
    );
  });
});

describe('Sheet widths and motion [UI foundation F8, G18]', () => {
  const sheet = (side: 'right' | 'left' | 'bottom', size?: 'sm' | 'md') =>
    render(
      createElement(Sheet, {
        open: true,
        children: createElement(
          SheetContent,
          {
            side,
            size,
            closeLabel: 'Закрити',
            'aria-describedby': undefined,
          },
          createElement(SheetTitle, null, 'Шторка'),
        ),
      }),
    );

  it.each([
    ['sm', 'sm:w-[22.5rem]'],
    ['md', 'sm:w-[25rem]'],
    [undefined, 'sm:w-[30rem]'],
  ] as const)('the right sheet of size %s is %s wide', (size, width) => {
    sheet('right', size);
    expect(classes(content())).toEqual(
      expect.arrayContaining([width, 'motion-sheet-side']),
    );
  });

  it('mirrors the drawer keyframes for a left sheet and slides a bottom sheet up', () => {
    sheet('left');
    expect(classes(content())).toEqual(
      expect.arrayContaining(['motion-sheet-side', '[--motion-dir:-1]']),
    );
    expect(classes(content()).some((name) => name.startsWith('sm:w-'))).toBe(
      false,
    );
    cleanup();
    sheet('bottom');
    expect(classes(content())).toContain('motion-sheet-up');
  });
});

function Opener({ onClose }: { onClose?: (event: Event) => void }) {
  const [shown, setShown] = useState(false);
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setShown(true) }, 'Відкрити'),
    createElement(Dialog, {
      open: shown,
      onOpenChange: setShown,
      children: createElement(
        DialogContent,
        { closeLabel: 'Закрити', onCloseAutoFocus: onClose },
        createElement(DialogHeader, { title: 'Діалог', subtitle: 'Опис' }),
      ),
    }),
  );
}

describe('focus return [UI foundation F8]', () => {
  it('gives focus back to the plain button that opened a controlled dialog', async () => {
    render(createElement(Opener));
    const opener = screen.getByRole('button', { name: 'Відкрити' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('leaves the focus to a caller that handles it', async () => {
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    render(
      createElement(Opener, {
        onClose: (event) => {
          event.preventDefault();
          elsewhere.focus();
        },
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Відкрити' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(elsewhere));
    elsewhere.remove();
  });
});

const key = (value: string) => ({ key: value }) as KeyboardEvent<HTMLElement>;
const press = (button: number) =>
  ({ button, ctrlKey: false }) as PointerEvent<HTMLElement>;

describe('menuAutoFocus [UI foundation F8]', () => {
  it('records the input source per open, not only the first', () => {
    const { result } = renderHook(() => useDeferredMenu(async () => undefined));
    act(() => result.current.sourceProps.onKeyDown(key('Enter')));
    expect(result.current.openedBy).toBe('keyboard');
    act(() => result.current.sourceProps.onPointerDown(press(0)));
    expect(result.current.openedBy).toBe('pointer');
    act(() => result.current.sourceProps.onKeyDown(key('ArrowDown')));
    expect(result.current.openedBy).toBe('keyboard');
  });

  it('ignores keys that do not open a menu and non-primary presses', () => {
    const { result } = renderHook(() => useDeferredMenu(async () => undefined));
    act(() => result.current.sourceProps.onKeyDown(key('Tab')));
    act(() => result.current.sourceProps.onPointerDown(press(2)));
    expect(result.current.openedBy).toBeNull();
  });

  it('marks a keyboard-opened menu instant and focuses its first item; a pointer-opened menu animates', () => {
    expect(menuAutoFocus('keyboard')).toMatchObject({ 'data-instant': '' });
    expect(menuAutoFocus('pointer')).toEqual({});
  });
});
