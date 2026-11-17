// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UrgencySection } from '@/components/vacancies/urgency-section';
import messages from '@/messages/uk.json';

// The lazy chunk of the control is still on its way.
vi.mock(
  '@/components/vacancies/urgency-toggle',
  () => new Promise<never>(() => undefined),
);

afterEach(cleanup);

describe('«Терміновість» while its chunk loads [STORY-VAC-08-2]', () => {
  it('shows heading, label and helper at once and reserves the height of the control', () => {
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
    const t = messages.vacancies.urgency;
    expect(screen.getByText(t.title)).toBeTruthy();
    expect(screen.getByText(t.label)).toBeTruthy();
    expect(screen.getByText(t.hint)).toBeTruthy();
    expect(
      document.querySelector('span[aria-hidden="true"].h-13'),
    ).not.toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
