'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { makeQueryClient } from '@/lib/query-client';
import type { Theme } from '@/lib/theme';

export function AppProviders({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialTheme={theme}>
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
