'use client';

import { useEffect } from 'react';
import { toast, Toaster as Sonner, type ToasterProps } from 'sonner';
import { connectToasts } from '@/lib/toast';

export default function ToastRuntime(props: ToasterProps) {
  useEffect(
    () => connectToasts(({ tone, message }) => toast[tone](message)),
    [],
  );
  return (
    <Sonner
      position="bottom-right"
      closeButton
      mobileOffset={{ bottom: 88 }}
      style={{ zIndex: 50 }}
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg! border! border-border! bg-surface! text-foreground! shadow-lg!',
          description: 'text-muted-foreground!',
          closeButton: 'border-border! bg-surface! text-muted-foreground!',
        },
      }}
      {...props}
    />
  );
}
