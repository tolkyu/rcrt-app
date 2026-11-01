'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from '@/lib/toast';
import { apiRequest } from '@/lib/api-client';

/** Ends the session through the auth API (SEC-AUTH-4); a full navigation drops every cached query. */
export function useLogout() {
  const t = useTranslations('shell');
  return useMutation({
    mutationFn: () =>
      apiRequest('/auth/logout', {
        method: 'POST',
        body: {},
        schema: async () =>
          (await import('@/lib/schemas/auth')).redirectResponseSchema,
      }),
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
    onError: () => toast.error(t('logoutFailed')),
  });
}
