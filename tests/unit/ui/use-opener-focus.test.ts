// @vitest-environment jsdom
import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useOpenerFocus } from '@/components/ui/use-opener-focus';

afterEach(cleanup);

const cancelable = () => new Event('focus', { cancelable: true });

function mountHook(options: Parameters<typeof useOpenerFocus>[0] = {}) {
  return renderHook(() => useOpenerFocus(options)).result.current;
}

function button(label: string) {
  const element = document.createElement('button');
  element.textContent = label;
  document.body.append(element);
  return element;
}

describe('useOpenerFocus handlers [UI foundation F8]', () => {
  it('records the focused element on open and focuses it again on close, taking over from Radix', () => {
    const opener = button('Відкрити');
    opener.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    document.body.focus();
    const close = cancelable();
    onCloseAutoFocus(close);
    expect(document.activeElement).toBe(opener);
    expect(close.defaultPrevented).toBe(true);
    opener.remove();
  });

  it('runs the caller handlers: open first on open, close first on close', () => {
    const order: string[] = [];
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook({
      onOpenAutoFocus: () => order.push('open'),
      onCloseAutoFocus: () => order.push('close'),
    });
    onOpenAutoFocus(cancelable());
    onCloseAutoFocus(cancelable());
    expect(order).toEqual(['open', 'close']);
  });

  it('leaves the focus alone when the caller prevented the close event', () => {
    const opener = button('Відкрити');
    const elsewhere = button('Інше');
    opener.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook({
      onCloseAutoFocus: (event) => {
        event.preventDefault();
        elsewhere.focus();
      },
    });
    onOpenAutoFocus(cancelable());
    onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(elsewhere);
    opener.remove();
    elsewhere.remove();
  });

  it('does not touch the event when the opener left the page, so Radix keeps its own fallback', () => {
    const opener = button('Видалений');
    opener.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    opener.remove();
    const close = cancelable();
    expect(() => onCloseAutoFocus(close)).not.toThrow();
    expect(close.defaultPrevented).toBe(false);
  });

  it('does not touch the event when nothing but <body> held focus on open', () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    const close = cancelable();
    onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(false);
  });

  it('does not touch the event when a close arrives without a recorded opener', () => {
    const { onCloseAutoFocus } = mountHook();
    const close = cancelable();
    onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(false);
  });

  it('follows the latest open: the second opener wins', () => {
    const first = button('Перший');
    const second = button('Другий');
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    first.focus();
    onOpenAutoFocus(cancelable());
    second.focus();
    onOpenAutoFocus(cancelable());
    document.body.focus();
    onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(second);
    first.remove();
    second.remove();
  });

  it('keeps stable handler identities while the caller handlers are stable', () => {
    const onOpenAutoFocus = vi.fn();
    const onCloseAutoFocus = vi.fn();
    const { result, rerender } = renderHook(() =>
      useOpenerFocus({ onOpenAutoFocus, onCloseAutoFocus }),
    );
    const first = result.current;
    rerender();
    expect(result.current.onOpenAutoFocus).toBe(first.onOpenAutoFocus);
    expect(result.current.onCloseAutoFocus).toBe(first.onCloseAutoFocus);
  });
});

function Plain({
  children,
}: {
  children: (close: () => void) => ReactElement;
}) {
  const [shown, setShown] = useState(false);
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setShown(true) }, 'Відкрити'),
    shown ? children(() => setShown(false)) : null,
  );
}

const opener = () => screen.getByRole('button', { name: 'Відкрити' });
const gone = (role: 'dialog' | 'alertdialog') =>
  waitFor(() => expect(screen.queryByRole(role)).toBeNull());

describe('every modal kind hands focus back to a plain button [UI foundation F8, behaviour change for existing callers]', () => {
  it('AlertDialog: Cancel button and Escape', async () => {
    render(
      createElement(Plain, {
        children: (close) =>
          createElement(
            AlertDialog,
            { open: true, onOpenChange: close },
            createElement(
              AlertDialogContent,
              { 'aria-describedby': undefined },
              createElement(AlertDialogTitle, null, 'Підтвердження'),
              createElement(AlertDialogCancel, null, 'Скасувати'),
            ),
          ),
      }),
    );
    await userEvent.click(opener());
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    await gone('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));

    await userEvent.click(opener());
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await gone('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it('Sheet opened by a plain button: Escape and the close icon', async () => {
    render(
      createElement(Plain, {
        children: (close) =>
          createElement(
            Sheet,
            { open: true, onOpenChange: close },
            createElement(
              SheetContent,
              {
                side: 'right',
                closeLabel: 'Закрити',
                'aria-describedby': undefined,
              },
              createElement(SheetTitle, null, 'Шторка'),
            ),
          ),
      }),
    );
    await userEvent.click(opener());
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await gone('dialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));

    await userEvent.click(opener());
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await gone('dialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it('Sheet with a Radix trigger still gets its trigger back', async () => {
    render(
      createElement(
        Sheet,
        null,
        createElement(SheetTrigger, null, 'Відкрити'),
        createElement(
          SheetContent,
          {
            side: 'bottom',
            closeLabel: 'Закрити',
            'aria-describedby': undefined,
          },
          createElement(SheetTitle, null, 'Шторка'),
        ),
      ),
    );
    await userEvent.click(opener());
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await gone('dialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it('Dialog opened from the keyboard returns focus after the close icon', async () => {
    render(
      createElement(Plain, {
        children: (close) =>
          createElement(
            Dialog,
            { open: true, onOpenChange: close },
            createElement(
              DialogContent,
              { closeLabel: 'Закрити' },
              createElement(DialogHeader, {
                title: 'Діалог',
                subtitle: 'Опис',
              }),
            ),
          ),
      }),
    );
    opener().focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await gone('dialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it('a modal opened from inside another one returns focus to the inner button, not to the outer opener', async () => {
    function Stack() {
      const [outer, setOuter] = useState(false);
      const [inner, setInner] = useState(false);
      return createElement(
        'div',
        null,
        createElement('button', { onClick: () => setOuter(true) }, 'Відкрити'),
        createElement(
          Dialog,
          { open: outer, onOpenChange: setOuter },
          createElement(
            DialogContent,
            { closeLabel: 'Закрити зовнішній' },
            createElement(DialogHeader, {
              title: 'Зовнішній',
              subtitle: 'Опис',
            }),
            createElement(
              'button',
              { onClick: () => setInner(true) },
              'Підтвердити дію',
            ),
            createElement(
              AlertDialog,
              { open: inner, onOpenChange: setInner },
              createElement(
                AlertDialogContent,
                { 'aria-describedby': undefined },
                createElement(AlertDialogTitle, null, 'Точно?'),
                createElement(AlertDialogCancel, null, 'Ні'),
              ),
            ),
          ),
        ),
      );
    }
    render(createElement(Stack));
    await userEvent.click(opener());
    await screen.findByRole('dialog');
    const innerOpener = screen.getByRole('button', { name: 'Підтвердити дію' });
    await userEvent.click(innerOpener);
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await gone('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(innerOpener));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await gone('dialog');
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it('an opener removed while the modal is open does not break closing and leaves the focus on <body>', async () => {
    function Vanishing() {
      const [shown, setShown] = useState(false);
      const [listed, setListed] = useState(true);
      return createElement(
        'div',
        null,
        listed
          ? createElement(
              'button',
              {
                onClick: () => {
                  setShown(true);
                  setListed(false);
                },
              },
              'Відкрити',
            )
          : null,
        createElement(
          Dialog,
          { open: shown, onOpenChange: setShown },
          createElement(
            DialogContent,
            { closeLabel: 'Закрити' },
            createElement(DialogHeader, { title: 'Діалог', subtitle: 'Опис' }),
          ),
        ),
      );
    }
    render(createElement(Vanishing));
    await userEvent.click(opener());
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await gone('dialog');
    await waitFor(() => expect(document.activeElement).toBe(document.body));
  });
});

/** Radix portals the menu out of its trigger and labels the content with the trigger's id. */
function menuWithTrigger() {
  const trigger = button('Меню');
  trigger.id = 'menu-trigger';
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-labelledby', trigger.id);
  const item = document.createElement('div');
  item.setAttribute('role', 'menuitem');
  item.tabIndex = -1;
  menu.append(item);
  document.body.append(menu);
  return { trigger, menu, item };
}

describe('a modal opened from a menu item [UI foundation F8.1, WCAG 2.4.3]', () => {
  it('hands focus to the menu trigger once the item is gone', () => {
    const { trigger, menu, item } = menuWithTrigger();
    item.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    menu.remove();
    const close = cancelable();
    onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('finds the trigger when the menu had unmounted before the modal mounted', async () => {
    // A fresh module copy keeps the global listener and the remembered element out of the other tests.
    vi.resetModules();
    const [{ trackLastFocus }, { useOpenerFocus: freshHook }] =
      await Promise.all([
        import('@/lib/last-focus'),
        import('@/components/ui/use-opener-focus'),
      ]);
    trackLastFocus();
    const { trigger, menu, item } = menuWithTrigger();
    item.focus();
    menu.remove();
    expect(document.activeElement).toBe(document.body);
    const { onOpenAutoFocus, onCloseAutoFocus } = renderHook(() =>
      freshHook({}),
    ).result.current;
    onOpenAutoFocus(cancelable());
    onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('climbs from a submenu item to the root trigger, because the sub-trigger unmounts with its menu', () => {
    const { trigger, menu, item } = menuWithTrigger();
    const subTrigger = document.createElement('div');
    subTrigger.id = 'sub-trigger';
    subTrigger.setAttribute('role', 'menuitem');
    menu.append(subTrigger);
    const subMenu = document.createElement('div');
    subMenu.setAttribute('role', 'menu');
    subMenu.setAttribute('aria-labelledby', subTrigger.id);
    subMenu.append(item);
    document.body.append(subMenu);
    item.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    menu.remove();
    subMenu.remove();
    onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('prefers the item itself while it is still on the page', () => {
    const { trigger, menu, item } = menuWithTrigger();
    item.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    trigger.focus();
    onCloseAutoFocus(cancelable());
    expect(document.activeElement).toBe(item);
    trigger.remove();
    menu.remove();
  });

  it('leaves the event to Radix when neither the item nor the trigger is left', () => {
    const { trigger, menu, item } = menuWithTrigger();
    item.focus();
    const { onOpenAutoFocus, onCloseAutoFocus } = mountHook();
    onOpenAutoFocus(cancelable());
    menu.remove();
    trigger.remove();
    const close = cancelable();
    onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(false);
  });
});
