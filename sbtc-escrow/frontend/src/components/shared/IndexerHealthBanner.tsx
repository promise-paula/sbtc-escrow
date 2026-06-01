import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useIndexerHealth } from '@/hooks/use-indexer-health';

/**
 * Top-of-page banner shown when the on-chain → Supabase indexer is lagging
 * or down. Lets users distinguish "your action didn't go through" from
 * "the chainhook is just behind right now."
 *
 * Hidden in the normal case (healthy + caught up). Shown when:
 *   - The health check itself failed (banner says "indexer is offline")
 *   - The chainhook is disabled (banner says "indexer paused")
 *   - The block lag exceeds a noticeable threshold (banner says "indexer is X blocks behind")
 *
 * Threshold is generous (>= 25 blocks) so brief catch-up windows don't
 * flash a banner at users. Anything sustained that long is worth surfacing.
 */

const LAG_BANNER_THRESHOLD_BLOCKS = 25;

export function IndexerHealthBanner() {
  const { data, isLoading } = useIndexerHealth();
  if (isLoading || !data) return null;
  if (data.healthy && (data.blockLag === null || data.blockLag < LAG_BANNER_THRESHOLD_BLOCKS)) {
    return null;
  }

  let message: string;
  if (data.chainhookEnabled === false) {
    message =
      'On-chain event indexer is paused. New escrow activity may not appear until it resumes.';
  } else if (data.blockLag !== null && data.blockLag >= LAG_BANNER_THRESHOLD_BLOCKS) {
    message = `On-chain event indexer is ${data.blockLag} blocks behind. New activity will appear once it catches up — usually within a few minutes.`;
  } else if (!data.healthy) {
    message =
      "Couldn't verify indexer health. Recent activity may be slow to appear.";
  } else {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2 text-xs text-foreground"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
      <span>{message}</span>
    </div>
  );
}
