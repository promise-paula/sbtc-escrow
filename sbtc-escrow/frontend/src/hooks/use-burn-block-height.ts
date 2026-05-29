import { useQuery } from '@tanstack/react-query';
import { STACKS_API_URL } from '@/lib/stacks-config';

/**
 * Current Bitcoin (burn) block height as seen by the Stacks node. Used to
 * compute expiry / dispute-timeout / review-window math for v3+ contracts,
 * which anchor time to burn-block-height rather than the variable-rate
 * stacks-block-height.
 *
 * Re-fetches every 60s; that's roughly aligned with Bitcoin's 10-min block
 * cadence (so we'd see at most one new burn block between refreshes).
 */
async function fetchBurnBlockHeight(): Promise<number> {
  const res = await fetch(`${STACKS_API_URL}/v2/info`);
  if (!res.ok) throw new Error('Failed to fetch burn block height');
  const data = await res.json();
  return data.burn_block_height as number;
}

export function useBurnBlockHeight() {
  return useQuery({
    queryKey: ['burn-block-height'],
    queryFn: fetchBurnBlockHeight,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
