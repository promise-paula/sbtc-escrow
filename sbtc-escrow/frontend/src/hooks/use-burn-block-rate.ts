import { useQuery } from '@tanstack/react-query';
import { STACKS_API_URL, BURN_BLOCK_MINUTES } from '@/lib/stacks-config';

interface BurnBlockRateResult {
  /** Median seconds between burn (Bitcoin) blocks, observed from recent chain */
  secondsPerBlock: number;
  /** Convenience: minutes per burn block */
  minutesPerBlock: number;
}

/**
 * Observed burn-block production rate, derived from the median delta between
 * recent burn blocks reported by the Stacks API. Used to project wall-clock
 * timestamps for *future* burn blocks (e.g. an escrow's expiration block).
 *
 * Past blocks should always use `useBurnBlockTimestamps` for real timestamps —
 * this hook only matters for the "X from now" projection.
 *
 * Falls back to the network-aware constant `BURN_BLOCK_MINUTES` on API failure.
 */
async function fetchBurnBlockRate(): Promise<BurnBlockRateResult> {
  const limit = 30;
  const res = await fetch(`${STACKS_API_URL}/extended/v2/burn-blocks?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch burn blocks');
  const data = await res.json();

  const blocks: { burn_block_time: number }[] = data.results ?? [];
  if (blocks.length < 2) return fallback();

  const deltas: number[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const delta = blocks[i].burn_block_time - blocks[i + 1].burn_block_time;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return fallback();

  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const medianSeconds =
    deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];

  const secondsPerBlock = Math.max(medianSeconds, 30); // floor at 30s
  return { secondsPerBlock, minutesPerBlock: secondsPerBlock / 60 };
}

function fallback(): BurnBlockRateResult {
  return {
    secondsPerBlock: BURN_BLOCK_MINUTES * 60,
    minutesPerBlock: BURN_BLOCK_MINUTES,
  };
}

export function useBurnBlockRate() {
  return useQuery({
    queryKey: ['burn-block-rate'],
    queryFn: fetchBurnBlockRate,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    placeholderData: fallback(),
  });
}
