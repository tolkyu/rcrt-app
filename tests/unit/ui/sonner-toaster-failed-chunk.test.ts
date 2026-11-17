// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { toast } from '@/lib/toast';

vi.mock('@/components/ui/sonner-runtime', () => {
  throw new Error('chunk failed to load');
});

afterEach(cleanup);

describe('Toaster with a runtime chunk that fails to load [UI foundation F7]', () => {
  it('stays empty without an unhandled rejection or a crash', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    render(createElement(Toaster));

    await act(async () => {
      toast.error('Недостатньо прав для цієї дії.');
    });

    expect(screen.queryByTestId('runtime')).toBeNull();
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });
});
