'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DemoId =
  'pop' | 'tooltip' | 'modal' | 'sheetUp' | 'sheetSide' | 'fade' | 'instant';

interface Labels {
  slow: string;
  show: string;
  hide: string;
  sample: string;
  demos: Record<DemoId, string>;
}

interface Demo {
  id: DemoId;
  className: string;
  openState: string;
  clipped?: boolean;
  instant?: boolean;
}

const demos: readonly Demo[] = [
  { id: 'pop', className: 'motion-pop', openState: 'open' },
  { id: 'tooltip', className: 'motion-tooltip', openState: 'delayed-open' },
  { id: 'modal', className: 'motion-modal', openState: 'open' },
  {
    id: 'sheetUp',
    className:
      'motion-sheet-up absolute inset-x-0 bottom-0 h-2/3 rounded-b-none',
    openState: 'open',
    clipped: true,
  },
  {
    id: 'sheetSide',
    className:
      'motion-sheet-side absolute inset-y-0 right-0 w-2/3 rounded-r-none',
    openState: 'open',
    clipped: true,
  },
  { id: 'fade', className: 'motion-fade', openState: 'open' },
  { id: 'instant', className: 'motion-pop', openState: 'open', instant: true },
];

// Every motion duration token at 3x, for the slow-motion review (design-system §8.4).
const slowTokens =
  '[--duration-popover:480ms] [--duration-popover-exit:360ms] [--duration-tooltip:375ms] [--duration-dialog:600ms] [--duration-dialog-exit:450ms] [--duration-drawer:720ms] [--duration-drawer-exit:540ms]';

function DemoCard({ demo, labels }: { demo: Demo; labels: Labels }) {
  const [open, setOpen] = useState(true);
  // An instant element has no exit keyframe, so it unmounts the way a real popover would.
  const mounted = open || !demo.instant;
  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{labels.demos[demo.id]}</h3>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? labels.hide : labels.show}
        </Button>
      </div>
      <div
        className={cn(
          'bg-surface-muted relative flex h-32 items-center justify-center rounded-lg',
          demo.clipped && 'overflow-hidden',
        )}
      >
        {mounted && (
          <div
            data-state={open ? demo.openState : 'closed'}
            data-instant={demo.instant ? '' : undefined}
            className={cn(
              'border-border bg-surface rounded-lg border px-3 py-2 text-xs shadow-md',
              demo.clipped && 'flex items-center justify-center',
              demo.className,
            )}
          >
            {labels.sample}
          </div>
        )}
      </div>
    </div>
  );
}

/** One live element per `motion-*` utility; the toggle replays its enter and exit keyframes. */
export function MotionDemos({ labels }: { labels: Labels }) {
  const [slow, setSlow] = useState(false);
  return (
    <div className={cn('flex flex-col gap-4', slow && slowTokens)}>
      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={slow}
          onChange={(event) => setSlow(event.target.checked)}
          className="size-4"
        />
        {labels.slow}
      </label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demos.map((demo) => (
          <DemoCard key={demo.id} demo={demo} labels={labels} />
        ))}
      </div>
    </div>
  );
}
