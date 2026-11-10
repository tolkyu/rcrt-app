'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';
import { Tooltip } from '@/components/ui/tooltip';
import { GalleryGroup } from './gallery-section';

interface Labels {
  basic: string;
  basicLabel: string;
  basicText: string;
  longLabel: string;
  longText: string;
  edge: string;
  edgeHint: string;
  edgeStart: string;
  edgeEnd: string;
  disabled: string;
  disabledHint: string;
  publish: string;
  publishReason: string;
  limitReason: string;
  save: string;
  available: string;
  attempts: string;
}

export function TooltipDemos({ labels }: { labels: Labels }) {
  const [attempts, setAttempts] = useState(0);
  const attempt = () => setAttempts((count) => count + 1);
  return (
    <>
      <GalleryGroup title={labels.basic}>
        <Tooltip content={labels.basicText}>
          <Button size="icon" variant="outline" aria-label={labels.basicLabel}>
            <Info aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip content={labels.longText} side="bottom">
          <Button variant="outline">{labels.longLabel}</Button>
        </Tooltip>
      </GalleryGroup>
      <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{labels.edge}</h3>
          <p className="text-muted-foreground max-w-prose text-xs">
            {labels.edgeHint}
          </p>
        </div>
        <div className="flex justify-between gap-3">
          <Tooltip content={labels.longText} side="bottom">
            <Button variant="outline">{labels.edgeStart}</Button>
          </Tooltip>
          <Tooltip content={labels.longText} side="bottom">
            <Button variant="outline">{labels.edgeEnd}</Button>
          </Tooltip>
        </div>
      </div>
      <GalleryGroup title={labels.disabled} hint={labels.disabledHint}>
        <DisabledReason reason={labels.publishReason}>
          <Button onClick={attempt}>{labels.publish}</Button>
        </DisabledReason>
        <DisabledReason reason={labels.limitReason}>
          <Button variant="outline" onClick={attempt}>
            {labels.save}
          </Button>
        </DisabledReason>
        <DisabledReason reason={labels.publishReason} disabled={false}>
          <Button variant="secondary" onClick={attempt}>
            {labels.available}
          </Button>
        </DisabledReason>
        <output className="text-muted-foreground text-sm tabular-nums">
          {labels.attempts} {attempts}
        </output>
      </GalleryGroup>
    </>
  );
}
