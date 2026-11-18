/** The optimistic side of an urgency change; loaded with the urgency control (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import {
  applyOptimisticFlip,
  type OptimisticFlip,
} from '@/lib/vacancy-optimistic-flip';
import type { VACANCY_PRIORITIES } from '@/lib/vacancy-filters';

type Priority = (typeof VACANCY_PRIORITIES)[number];

export type OptimisticUrgency = OptimisticFlip;

export const applyOptimisticUrgency = (
  queryClient: QueryClient,
  id: string,
  from: Priority,
  to: Priority,
): OptimisticUrgency => {
  const value = (side: 'from' | 'to') => (side === 'from' ? from : to);
  return applyOptimisticFlip(queryClient, id, {
    shows: (item, side) => item.priority === value(side),
    put: (item, side) => ({ ...item, priority: value(side) }),
  });
};
