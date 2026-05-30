import React from 'react';
import { useBlockHeight } from '@/hooks/use-block-height';
import { useBurnBlockHeight } from '@/hooks/use-burn-block-height';
import { useBlockRate } from '@/hooks/use-block-rate';
import {
  DEFAULT_DISPUTE_TIMEOUT,
  DEFAULT_MINUTES_PER_BLOCK,
  BURN_BLOCK_MINUTES,
  usesBurnBlockClock,
  CONTRACT_PRINCIPAL,
} from '@/lib/stacks-config';
import { blocksToTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface DisputeTimeoutProgressProps {
  disputedAt: number;
  timeoutBlocks?: number;
  /** Contract id this dispute belongs to. v3+ contracts anchor disputed_at
   *  to burn-block-height (stable ~10 min/block) while legacy v2/v7 use
   *  stacks-block-height. Mixing the two caused every v3 dispute to render
   *  as "Timed Out" within seconds. Defaults to the active contract for
   *  backwards compatibility with callers that didn't pass it yet. */
  contractId?: string;
}

export function DisputeTimeoutProgress({
  disputedAt,
  timeoutBlocks = DEFAULT_DISPUTE_TIMEOUT,
  contractId = CONTRACT_PRINCIPAL,
}: DisputeTimeoutProgressProps) {
  const burnClock = usesBurnBlockClock(contractId);
  const { data: stacksBlock = 0 } = useBlockHeight();
  const { data: burnBlock = 0 } = useBurnBlockHeight();
  const currentBlock = burnClock ? burnBlock : stacksBlock;
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = burnClock ? BURN_BLOCK_MINUTES : (blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK);

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
