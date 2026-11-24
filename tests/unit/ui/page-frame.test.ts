// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from '@/components/shell/page-header';
import { FormPageFooter } from '@/components/ui/form-page-frame';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';

afterEach(cleanup);

describe('PageHeader [UI foundation F9, G6]', () => {
  it('orders [secondary, primary] and mirrors the primary into the mobile bar only', () => {
    const { container } = render(
      createElement(PageHeader, {
        title: 'Вакансії',
        actions: createElement('button', null, 'Довідник посад'),
        primary: createElement('button', null, 'Створити вакансію'),
      }),
    );
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual([
      'Довідник посад',
      'Створити вакансію',
      'Створити вакансію',
    ]);
    const desktop = screen.getAllByRole('button')[1]!.parentElement!;
    expect(desktop.className).toBe('hidden md:contents');
    const bar = container.querySelector('[data-sticky-action-bar]')!;
    expect(bar.className).toContain('md:hidden');
    expect(bar.className).toContain('bottom-(--chrome-bottom)');
    expect(within(bar as HTMLElement).getByRole('button').textContent).toBe(
      'Створити вакансію',
    );
  });

  it('renders no bar and no action box without actions', () => {
    const { container } = render(
      createElement(PageHeader, { title: 'Профіль' }),
    );
    expect(container.querySelector('[data-sticky-action-bar]')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('FormPageFooter [UX review P11]', () => {
  const footerClass = () => {
    const { container } = render(
      createElement(FormPageFooter, {
        children: createElement('button', null, 'Зберегти'),
      }),
    );
    return container.querySelector('[data-slot="form-page-footer"]')!.className;
  };
  it('insets the actions from the band edge on desktop', () => {
    const name = footerClass();
    expect(name).toContain('md:px-4');
    expect(name).not.toContain('md:px-0');
  });
  it('keeps square corners so scrolled content cannot show through (M2)', () => {
    expect(footerClass()).not.toContain('rounded');
  });
  it('cancels the part of the shell padding the BottomNav does not cover, and keeps its offset', () => {
    const name = footerClass();
    expect(name).toContain(
      'max-md:[:root:has([data-bottom-nav])_&]:mb-[calc(var(--chrome-bottom)-7rem)]',
    );
    expect(name).toContain('bottom-(--chrome-bottom)');
    expect(name).toContain('after:h-[env(safe-area-inset-bottom)]');
  });
});

describe('RowActionsMenu [UI foundation F9, G11]', () => {
  const onSelect = vi.fn();
  const actions = [
    { id: 'delete', label: 'Видалити чернетку', destructive: true, onSelect },
    { id: 'edit', label: 'Редагувати', onSelect },
    {
      id: 'publish',
      label: 'Опублікувати',
      disabledReason: 'Спочатку оберіть посаду',
      onSelect,
    },
  ];

  it('names the trigger, lists safe actions before a separator and destructive ones, and explains a disabled action', async () => {
    const user = userEvent.setup();
    render(
      createElement(RowActionsMenu, {
        label: 'Дії з вакансією «Медіабаєр»',
        actions,
      }),
    );
    const trigger = screen.getByRole('button', {
      name: 'Дії з вакансією «Медіабаєр»',
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.className).toContain('pointer-coarse:size-11');
    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(
      [...menu.children].map((node) =>
        node.getAttribute('role') === 'separator' ? '---' : node.textContent,
      ),
    ).toEqual([
      'Редагувати',
      'ОпублікуватиСпочатку оберіть посаду',
      '---',
      'Видалити чернетку',
    ]);
    const publish = within(menu).getByRole('menuitem', {
      name: /Опублікувати/,
    });
    expect(publish.getAttribute('aria-disabled')).toBe('true');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Редагувати' }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without actions', () => {
    const { container } = render(
      createElement(RowActionsMenu, { label: 'Дії', actions: [] }),
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('RowActionsMenu keyboard, disabled and grouping [UI foundation F9, G11]', () => {
  const roles = (menu: HTMLElement) =>
    [...menu.children].map((node) =>
      node.getAttribute('role') === 'separator' ? '---' : node.textContent,
    );

  it('opens from the keyboard, runs a destructive action and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(
      createElement(RowActionsMenu, {
        label: 'Дії',
        actions: [
          { id: 'edit', label: 'Редагувати', onSelect: vi.fn() },
          {
            id: 'delete',
            label: 'Видалити',
            destructive: true,
            onSelect: remove,
          },
        ],
      }),
    );
    screen.getByRole('button', { name: 'Дії' }).focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitem', { name: 'Редагувати' }),
    );
    await user.keyboard('{ArrowDown}{Enter}');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Дії' }),
    );
  });

  it('Escape closes the menu without running anything and returns focus', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      createElement(RowActionsMenu, {
        label: 'Дії',
        actions: [{ id: 'edit', label: 'Редагувати', onSelect }],
      }),
    );
    screen.getByRole('button', { name: 'Дії' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Дії' }),
    );
  });

  it('never runs a disabled action and keeps the menu open', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      createElement(RowActionsMenu, {
        label: 'Дії',
        actions: [
          {
            id: 'publish',
            label: 'Опублікувати',
            disabledReason: 'Спочатку оберіть посаду',
            onSelect,
          },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Дії' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Спочатку оберіть посаду')).toBeTruthy();
    await user.click(within(menu).getByRole('menuitem'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('draws a separator only between safe and destructive groups', async () => {
    const user = userEvent.setup();
    const item = (id: string, destructive?: boolean) => ({
      id,
      label: id,
      destructive,
      onSelect: vi.fn(),
    });
    const open = async (label: string, actions: ReturnType<typeof item>[]) => {
      render(createElement(RowActionsMenu, { label, actions }));
      await user.click(screen.getByRole('button', { name: label }));
      return screen.findByRole('menu');
    };
    expect(roles(await open('safe', [item('a'), item('b')]))).toEqual([
      'a',
      'b',
    ]);
    cleanup();
    expect(
      roles(await open('danger', [item('x', true), item('y', true)])),
    ).toEqual(['x', 'y']);
    cleanup();
    expect(
      roles(await open('mixed', [item('x', true), item('a'), item('y', true)])),
    ).toEqual(['a', '---', 'x', 'y']);
  });
});
