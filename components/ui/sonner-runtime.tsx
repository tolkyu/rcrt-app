'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast, Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/components/theme/theme-provider';
import { connectToasts } from '@/lib/toast';
import { AppToast } from './app-toast';

/** Sonner keeps stacking, swipe and timers; `AppToast` is the headless body. */
export default function ToastRuntime(props: ToasterProps) {
  const t = useTranslations('common');
  const { theme } = useTheme();
  useEffect(
    () =>
      connectToasts(({ id, duration, ...content }) =>
        toast.custom((toastId) => <AppToast id={toastId} {...content} />, {
          id,
          duration,
        }),
      ),
    [],
  );
  return (
    <Sonner
      position="bottom-right"
      theme={theme}
      visibleToasts={3}
      customAriaLabel={t('notifications')}
      offset={{
        right: 24,
        bottom:
          'calc(var(--chrome-bottom) + var(--sticky-bar-bottom, 0px) + 24px)',
      }}
      mobileOffset={{
        bottom:
          'calc(var(--chrome-bottom) + var(--sticky-bar-bottom, 0px) + 12px)',
      }}
      style={{ zIndex: 'var(--z-toast)' }}
      {...props}
    />
  );
}
