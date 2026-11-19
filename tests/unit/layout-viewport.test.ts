import { afterEach, describe, expect, it, vi } from 'vitest';

const cookieValue = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () =>
      cookieValue.current === undefined
        ? undefined
        : { value: cookieValue.current },
  }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

afterEach(() => {
  cookieValue.current = undefined;
});

describe('generateViewport [UI foundation F1, ui-foundation §6]', () => {
  it('covers the notch and resizes content with the keyboard', async () => {
    const { generateViewport } = await import('@/app/layout');
    const viewport = await generateViewport();
    expect(viewport.viewportFit).toBe('cover');
    expect(viewport.interactiveWidget).toBe('resizes-content');
  });

  it('follows the OS scheme per media query without a theme cookie', async () => {
    const { generateViewport } = await import('@/app/layout');
    expect((await generateViewport()).themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#ffffff' },
      { media: '(prefers-color-scheme: dark)', color: '#111827' },
    ]);
  });

  it.each([
    ['dark', '#111827'],
    ['light', '#ffffff'],
  ])('a %s cookie overrides both media entries', async (theme, color) => {
    cookieValue.current = theme;
    const { generateViewport } = await import('@/app/layout');
    expect((await generateViewport()).themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color },
      { media: '(prefers-color-scheme: dark)', color },
    ]);
  });
});
