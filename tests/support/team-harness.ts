import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { vi } from 'vitest';
import messages from '../../messages/uk.json';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { shareVacancy, SHARE_ID } from './vacancy-share-harness';

export { SHARE_ID as ID };
export const VERTICAL_ID = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';

/** One vertical for every answer of a test: a card that changes vertical between reads would change its pickers' keys. */
export const vacancy = (overrides: Partial<VacancyDetail> = {}) =>
  shareVacancy({
    vertical: { id: VERTICAL_ID, name: 'Гемблінг' },
    ...overrides,
  });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const problem = (
  status: number,
  code: string,
  errors: { path: string; code: string }[] = [],
) => json({ code, errors }, status);

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Routes by `METHOD path` (query included); an unrouted request answers 500 so a stray call is visible in the assertions. */
export function stubApi(
  routes: Record<string, () => Response | Promise<Response>>,
) {
  const calls: Call[] = [];
  const spy = vi.fn<typeof fetch>((input, init) => {
    const path = String(input).replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      path,
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as unknown)
          : null,
    });
    const route = routes[`${method} ${path}`];
    return Promise.resolve(route ? route() : problem(500, 'INTERNAL'));
  });
  vi.stubGlobal('fetch', spy);
  return { calls, spy };
}

export function mountTeam(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const wrap = (children: ReactElement) =>
    createElement(NextIntlClientProvider, {
      locale: 'uk',
      timeZone: 'Europe/Kyiv',
      messages,
      onError: (error) => {
        throw error;
      },
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children,
      }),
    });
  const view = render(wrap(node));
  return {
    queryClient,
    ...view,
    /** Re-renders inside the same providers. */
    update: (next: ReactElement) => view.rerender(wrap(next)),
  };
}
