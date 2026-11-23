// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VacancyContentAccessState } from '@/components/vacancies/use-vacancy-content-access';
import {
  VacancyContentEditLink,
  VacancyContentPanel,
} from '@/components/vacancies/vacancy-content-panel';
import { VacancyOverview } from '@/components/vacancies/vacancy-overview';
import {
  vacancyContentReadSchema,
  type VacancyContentRead,
} from '@/lib/schemas/vacancy-content';
import { queryKeys } from '@/lib/query-keys';
import messages from '@/messages/uk.json';
import {
  SHARE_ID,
  mountInUk as mount,
  shareVacancy,
} from '@/tests/support/vacancy-share-harness';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const copy = messages.vacancies;
const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text', text }] }],
});
const content = (
  overrides: Partial<VacancyContentRead> = {},
): VacancyContentRead =>
  vacancyContentReadSchema.parse({
    id: SHARE_ID,
    version: 1,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: doc('Опис ролі'),
    requirementsDoc: null,
    status: 'OPEN',
    canEditContent: true,
    ...overrides,
  });
const readable = (
  overrides: Partial<VacancyContentRead> = {},
  refreshing = false,
): VacancyContentAccessState => ({
  kind: 'readable',
  content: content(overrides),
  refreshing,
  canEdit: false,
});
const checking: VacancyContentAccessState = { kind: 'checking', error: null };
const unavailable: VacancyContentAccessState = {
  kind: 'unavailable',
  reason: 'notFound',
  code: 'NOT_FOUND',
};
const link = () =>
  screen.queryByRole('link', { name: copy.contentCard.editAction });
const follows = (before: Node, after: Node) =>
  (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

afterEach(cleanup);

describe('content edit link gating [VAC-08, ADR-020]', () => {
  it.each([
    ['OPEN', true, true],
    ['ON_HOLD', true, true],
    ['OPEN', false, false],
    ['DRAFT', true, false],
    ['FILLED', true, false],
    ['CANCELLED', true, false],
  ] as const)(
    '%s with canEditContent=%s shows link=%s',
    (status, can, shown) => {
      mount(
        createElement(VacancyContentEditLink, {
          id: SHARE_ID,
          state: readable({ status, canEditContent: can }),
        }),
      );
      expect(!!link()).toBe(shown);
      if (shown)
        expect(link()?.getAttribute('href')).toBe(
          `/vacancies/${SHARE_ID}/content/edit`,
        );
    },
  );

  it('keeps the link during a background refresh of the same read', () => {
    mount(
      createElement(VacancyContentEditLink, {
        id: SHARE_ID,
        state: readable({}, true),
      }),
    );
    expect(link()).not.toBeNull();
  });

  it.each([
    ['checking', checking],
    ['checking with error', { kind: 'checking', error: new Error('x') }],
    ['unavailable', unavailable],
  ] as const)('shows no link while %s', (_name, state) => {
    mount(createElement(VacancyContentEditLink, { id: SHARE_ID, state }));
    expect(link()).toBeNull();
  });
});

describe('content panel states [VAC-01]', () => {
  const retry = vi.fn();
  const client = new QueryClient();
  const panel = (state: VacancyContentAccessState) =>
    mount(
      createElement(QueryClientProvider, {
        client,
        children: createElement(VacancyContentPanel, {
          id: SHARE_ID,
          state,
          onRetry: retry,
        }),
      }),
    );

  it('renders the document and an empty state for a NULL field', () => {
    panel(readable());
    expect(screen.getByText('Опис ролі')).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: copy.contentCard.title }),
    ).not.toBeNull();
    expect(screen.getByText(copy.contentEdit.emptyRequirements)).not.toBeNull();
    expect(screen.queryByText(copy.contentEdit.emptyDescription)).toBeNull();
  });

  it('shows the empty copy for both fields after a successful read', () => {
    panel(readable({ descriptionDoc: null, requirementsDoc: null }));
    expect(screen.getByText(copy.contentEdit.emptyDescription)).not.toBeNull();
    expect(screen.getByText(copy.contentEdit.emptyRequirements)).not.toBeNull();
  });

  it('shows a loading status, no empty copy and no error while checking', () => {
    panel(checking);
    expect(screen.getByRole('status')).not.toBeNull();
    expect(screen.queryByText(copy.contentEdit.emptyDescription)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a retryable section error that re-reads the content', () => {
    retry.mockClear();
    panel({ kind: 'checking', error: new Error('boom') });
    expect(screen.getByRole('alert')).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: messages.common.retry }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('disables the retry button while the content is being fetched again', async () => {
    client
      .fetchQuery({
        queryKey: queryKeys.vacancyContent(SHARE_ID),
        queryFn: () => new Promise<never>(() => undefined),
      })
      .catch(() => undefined);
    panel({ kind: 'checking', error: new Error('boom') });
    const button = await screen.findByRole('button', {
      name: messages.common.retry,
    });
    expect(button.hasAttribute('disabled')).toBe(true);
    client.clear();
  });

  it.each([
    ['a draft', readable({ status: 'DRAFT', canEditContent: false })],
    ['an unavailable card', unavailable],
  ])('renders nothing for %s', (_name, state) => {
    panel(state);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('keeps closed vacancies read-only: documents without any edit control', () => {
    panel(readable({ status: 'FILLED', canEditContent: true }));
    expect(screen.getByText('Опис ролі')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(link()).toBeNull();
  });
});

describe('overview slot contract [ADR-020]', () => {
  it('renders the header action after Share and the content slot after the terms', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: shareVacancy(),
        headerAction: createElement('a', { href: '/slot-a' }, 'slot-action'),
        content: createElement('p', null, 'slot-content'),
      }),
    );
    expect(
      follows(
        screen.getByRole('button', { name: copy.share }),
        screen.getByText('slot-action'),
      ),
    ).toBe(true);
    expect(
      follows(
        screen.getByRole('heading', { name: copy.termsTitle }),
        screen.getByText('slot-content'),
      ),
    ).toBe(true);
  });

  it('renders neither slot for a private draft', () => {
    mount(
      createElement(VacancyOverview, {
        vacancy: shareVacancy({ status: 'DRAFT' }),
        canAuthorDrafts: true,
        headerAction: createElement('a', { href: '/slot-a' }, 'slot-action'),
        content: createElement('p', null, 'slot-content'),
      }),
    );
    expect(screen.queryByText('slot-action')).toBeNull();
    expect(screen.queryByText('slot-content')).toBeNull();
  });

  it.each([
    'components/vacancies/vacancy-overview.tsx',
    'components/vacancies/vacancy-preview.tsx',
  ])('%s imports no content query, viewer or editor module', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(
      /vacancy-content|rich-text|queries\/vacancy-content/,
    );
  });
});
