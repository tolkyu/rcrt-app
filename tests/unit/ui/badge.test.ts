// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Bot } from 'lucide-react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge, type BadgeProps } from '@/components/ui/badge';

afterEach(cleanup);

const badge = (props: BadgeProps) => {
  render(createElement(Badge, props));
  return screen
    .getByText(props.children)
    .closest<HTMLElement>('[data-slot="badge"]')!;
};

describe('Badge [UI foundation F2]', () => {
  it.each([
    ['neutral', 'bg-surface-muted', 'text-muted-foreground-strong'],
    ['success', 'bg-success-subtle', 'text-success-text'],
    ['warning', 'bg-warning-subtle', 'text-warning-text'],
    ['info', 'bg-info-subtle', 'text-info-text'],
    ['danger', 'bg-destructive-subtle', 'text-error-text'],
    ['brand', 'bg-primary-subtle', 'text-link'],
  ] as const)(
    'renders the %s tone as a text pill that never wraps',
    (tone, background, text) => {
      const element = badge({ tone, children: `Текст ${tone}` });
      expect(element.className).toContain(background);
      expect(element.className).toContain(text);
      expect(element.className).toContain('rounded-full');
      expect(element.className).toContain('whitespace-nowrap');
      expect(element.className).toContain('shrink-0');
    },
  );

  it('draws a dashed transparent outline for a draft', () => {
    const element = badge({
      tone: 'neutral',
      dashed: true,
      outline: true,
      children: 'Чернетка',
    });
    expect(element.className).toContain('border-dashed');
    expect(element.className).toContain('border-input');
    expect(element.className).toContain('bg-transparent');
    expect(element.className).not.toContain('bg-surface-muted');
  });

  it('outlines in the tone colour', () => {
    const element = badge({ tone: 'info', outline: true, children: 'З бота' });
    expect(element.className).toContain('border-info');
    expect(element.className).not.toContain('bg-info-subtle');
  });

  it('keeps the text next to a decorative icon or dot', () => {
    const withIcon = badge({ icon: Bot, tone: 'info', children: 'З бота' });
    expect(withIcon.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    cleanup();
    const withDot = badge({ dot: true, children: 'Відкрита' });
    expect(withDot.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('clamps a long value to one line and exposes the full text in the title', () => {
    const value = 'customer-feedback-enterprise-onboarding';
    const element = badge({ truncate: true, children: value });
    expect(element.getAttribute('title')).toBe(value);
    expect(element.className).toContain('max-w-48');
    expect(element.querySelector('.truncate')?.textContent).toBe(value);
  });

  it('adds no title when the value is not clamped', () => {
    expect(badge({ children: 'Відкрита' }).hasAttribute('title')).toBe(false);
  });
});
