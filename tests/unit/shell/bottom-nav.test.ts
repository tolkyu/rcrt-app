// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRound } from 'lucide-react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/shell/bottom-nav';
import { mobileNav, NAV_ITEMS, type NavItem, type NavItemId } from '@/lib/nav';
import messages from '@/messages/uk.json';

const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => createElement('a', { href, ...props }, children),
}));

const sections = ['/a', '/b', '/c', '/d', '/e', '/f'].map((href): NavItem => ({
  id: 'profile' as NavItemId,
  href,
  icon: UserRound,
  zone: 'main',
  mobile: href === '/f' ? 'more' : 'bar',
  anyOf: null,
}));

function renderNav(current: string, items: readonly NavItem[] = sections) {
  pathname.current = current;
  const nav = mobileNav(items)!;
  render(
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      children: createElement(QueryClientProvider, {
        client: new QueryClient(),
        children: createElement(BottomNav, { nav }),
      }),
    }),
  );
  return screen.getByRole('navigation', { name: messages.shell.mobileNav });
}
const hrefs = (links: HTMLElement[]) =>
  links.map((link) => link.getAttribute('href'));

afterEach(cleanup);

describe('BottomNav: 4 slots + «Ще» sheet with the overflow and «Вийти» [A-46, screens.md §1]', () => {
  it('shows the Admin destinations directly without an overflow trigger [UX-G-07]', () => {
    const nav = renderNav('/settings/users', NAV_ITEMS);
    expect(hrefs(within(nav).getAllByRole('link'))).toEqual([
      '/profile',
      '/settings',
    ]);
    expect(
      within(nav)
        .getByRole('link', { name: messages.nav.settings })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(nav).queryByRole('button', { name: messages.shell.more }),
    ).toBeNull();
  });

  it('renders four bar links and the «Ще» trigger', () => {
    const nav = renderNav('/b');
    expect(hrefs(within(nav).getAllByRole('link'))).toEqual([
      '/a',
      '/b',
      '/c',
      '/d',
    ]);
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveProperty(
      'pathname',
      '/b',
    );
    expect(
      within(nav).getByRole('button', { name: messages.shell.more }),
    ).toBeTruthy();
  });

  it('opens «Ще» with the fifth bar section, more-only sections and logout', async () => {
    const nav = renderNav('/a');
    await userEvent.click(
      within(nav).getByRole('button', { name: messages.shell.more }),
    );
    const sheet = await screen.findByRole('dialog', {
      name: messages.shell.moreTitle,
    });
    expect(hrefs(within(sheet).getAllByRole('link'))).toEqual(['/e', '/f']);
    expect(
      within(sheet).getByRole('button', { name: messages.shell.logout }),
    ).toBeTruthy();
  });

  it('marks «Ще» active and the overflow link current when the page lives under it', async () => {
    const nav = renderNav('/e/details');
    const more = within(nav).getByRole('button', { name: messages.shell.more });
    expect(more.className).toContain('text-link');
    expect(within(nav).queryByRole('link', { current: 'page' })).toBeNull();
    await userEvent.click(more);
    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByRole('link', { current: 'page' }).getAttribute('href'),
    ).toBe('/e');
  });

  it('leaves «Ще» inactive on a bar section', () => {
    const nav = renderNav('/c');
    expect(
      within(nav).getByRole('button', { name: messages.shell.more }).className,
    ).not.toContain('text-link');
  });
});
