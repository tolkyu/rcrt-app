import 'server-only';
import { cache } from 'react';
import { makeQueryClient } from '@/lib/query-client';

/** One QueryClient per RSC request; pages prefetch into it and dehydrate for HydrationBoundary (ADR-007). */
export const getQueryClient = cache(makeQueryClient);
