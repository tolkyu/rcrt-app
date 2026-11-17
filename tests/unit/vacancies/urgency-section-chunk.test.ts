// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UrgencySection } from '@/components/vacancies/urgency-section';
import messages from '@/messages/uk.json';

// A tab older than the last deploy: the lazy chunk of the control cannot load.
vi.mock('@/components/vacancies/urgency-toggle', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

afterEach(cleanup);

describe('«Терміновість» when its chunk cannot load [STORY-VAC-08-2]', () => {
  it('keeps heading, label and helper, says why there is no control, and does not crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        timeZone: 'Europe/Kyiv',
        messages,
        children: createElement(QueryClientProvider, {
          client: new QueryClient(),
          children: createElement(UrgencySection, {
            vacancy: {
              id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
              number: 'V-0007',
              priority: 'NORMAL',
              version: 3,
            },
            preview: false,
            Heading: 'h2',
            onRemoved: vi.fn(),
          }),
        }),
      }),
    );
    expect(
      await screen.findByText(messages.vacancies.urgency.unavailable),
    ).toBeTruthy();
    expect(screen.getByText(messages.vacancies.urgency.title)).toBeTruthy();
    expect(screen.getByText(messages.vacancies.urgency.hint)).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
