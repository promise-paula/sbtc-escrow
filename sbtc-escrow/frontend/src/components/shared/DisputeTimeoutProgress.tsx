import React from 'react';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBlockRate } from '@/hooks/use-block-rate';
import { DEFAULT_DISPUTE_TIMEOUT, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';
import { Progress } from '@/components/ui/progress';
import { blocksToTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface DisputeTimeoutProgressProps {
  disputedAt: number;
  timeoutBlocks?: number;
}

export function DisputeTimeoutProgress({ disputedAt, timeoutBlocks = DEFAULT_DISPUTE_TIMEOUT }: DisputeTimeoutProgressProps) {
  const { data: currentBlock = 0 } = useBlockHeight();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;

  if (!currentBlock || !disputedAt) {
    return (
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Dispute Timeout</span>
        <div className="h-2 w-full rounded-full bg-secondary" />
        <p className="text-xs text-muted-foreground">Loading block data…</p>
      </div>
    );
  }

  const elapsed = currentBlock - disputedAt;
  const progress = Math.min((elapsed / timeoutBlocks) * 100, 100);
  const remaining = Math.max(timeoutBlocks - elapsed, 0);
  const timedOut = elapsed >= timeoutBlocks;

  let colorClass = 'bg-muted-foreground';
  let label = `${blocksToTime(elapsed, minutesPerBlock)} elapsed · ${elapsed.toLocaleString()} / ${timeoutBlocks.toLocaleString()} blocks`;

  if (timedOut) {
    colorClass = 'bg-destructive';
    label = 'Timed out — buyer can recover funds';
  } else if (progress >= 90) {
    colorClass = 'bg-destructive';
    label = `Timeout imminent — ${blocksToTime(remaining, minutesPerBlock)} remaining (${remaining.toLocaleString()} blocks)`;
  } else if (progress >= 50) {
    colorClass = 'bg-warning';
    label = `Timeout approaching — ${blocksToTime(remaining, minutesPerBlock)} remaining (${remaining.toLocaleString()} blocks)`;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Dispute Timeout</span>
        {timedOut && (
          <Badge variant="destructive" className="text-xs h-5">Timed Out</Badge>
        )}
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Dispute timeout progress">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
