// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from '@/components/shell/page-header';
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
