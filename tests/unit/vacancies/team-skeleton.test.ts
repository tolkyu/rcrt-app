// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamSkeleton } from '@/components/vacancies/team-skeleton';

afterEach(cleanup);

describe('«Команда» skeleton [wireframe vacancy-card §9]', () => {
  it('has one Team Lead row and two recruiter rows of the final 44 px height, hidden from assistive tech', () => {
    const { container } = render(createElement(TeamSkeleton));
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.querySelectorAll('.h-11')).toHaveLength(3);
    expect(container.querySelectorAll('.size-9.rounded-full')).toHaveLength(3);
  });
});
