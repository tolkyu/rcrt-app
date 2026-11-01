'use client';

import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { SectionError } from '@/components/states/section-error';
import { Card } from '@/components/ui/card';

/** Page-level failure inside the shell: the shell stays usable, details stay in server logs (UI-06). */
export default function AppError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <SectionError
        onRetry={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      />
    </Card>
  );
}
