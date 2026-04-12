import React from 'react';
import { CURRENT_BLOCK_HEIGHT, mockConfig } from '@/lib/mock-data';
import { Progress } from '@/components/ui/progress';
import { blocksToTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface DisputeTimeoutProgressProps {
  disputedAt: number;
  timeoutBlocks?: number;
}

export function DisputeTimeoutProgress({ disputedAt, timeoutBlocks = mockConfig.disputeTimeout }: DisputeTimeoutProgressProps) {
  const elapsed = CURRENT_BLOCK_HEIGHT - disputedAt;
  const progress = Math.min((elapsed / timeoutBlocks) * 100, 100);
  const remaining = Math.max(timeoutBlocks - elapsed, 0);
  const timedOut = elapsed >= timeoutBlocks;

  let colorClass = 'bg-muted-foreground';
  let label = `${elapsed.toLocaleString()} / ${timeoutBlocks.toLocaleString()} blocks`;

  if (timedOut) {
    colorClass = 'bg-destructive';
    label = 'Timed out — buyer can recover funds';
  } else if (progress >= 90) {
    colorClass = 'bg-destructive';
    label = `Timeout imminent — ${remaining.toLocaleString()} blocks remaining`;
  } else if (progress >= 50) {
    colorClass = 'bg-warning';
    label = `Timeout approaching — ${blocksToTime(remaining)} remaining`;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Dispute Timeout</span>
        {timedOut && (
          <Badge variant="destructive" className="text-[10px] h-5">Timed Out</Badge>
        )}
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Dispute timeout progress">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
