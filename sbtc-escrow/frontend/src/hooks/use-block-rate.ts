import { useQuery } from '@tanstack/react-query';
import { STACKS_API_URL, DEFAULT_MINUTES_PER_BLOCK } from '@/lib/stacks-config';

interface BlockRateResult {
  /** Average minutes per block based on recent blocks */
  minutesPerBlock: number;
  /** Convenience: estimated blocks per hour */
  blocksPerHour: number;
  /** Convenience: estimated blocks per day */
  blocksPerDay: number;
}

/**
 * Fetches the last N blocks and computes the average block time.
 * Falls back to DEFAULT_MINUTES_PER_BLOCK (1.5) on error.
 */
async function fetchBlockRate(): Promise<BlockRateResult> {
  // Hiro caps /extended/v2/blocks at limit=30. We use the median of the
  // inter-block deltas (not the mean) so a single anomalous gap — e.g. a
  // 10-min Bitcoin slowdown surrounded by 5-second blocks — doesn't blow
  // up the estimate. Median over 29 deltas gives a stable, refresh-
  // resistant value without re-rendering "expires in" wildly.
  const limit = 30;
  const res = await fetch(`${STACKS_API_URL}/extended/v2/blocks?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch recent blocks');
  const data = await res.json();

  // Use block_time (Stacks block timestamp), NOT burn_block_time (Bitcoin)
  // since stacks-block-height in Clarity tracks Stacks blocks
  const blocks: { block_time: number }[] = data.results ?? [];
  if (blocks.length < 2) return fallback();

  // blocks are newest-first; collect positive deltas, take the median
  const deltas: number[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const delta = blocks[i].block_time - blocks[i + 1].block_time;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return fallback();

  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const medianSeconds =
    deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];

  const minutesPerBlock = Math.max(medianSeconds / 60, 0.01); // floor at 0.6s

  return {
    minutesPerBlock,
    blocksPerHour: 60 / minutesPerBlock,
    blocksPerDay: (60 / minutesPerBlock) * 24,
  };
}

function fallback(): BlockRateResult {
  return {
    minutesPerBlock: DEFAULT_MINUTES_PER_BLOCK,
    blocksPerHour: 60 / DEFAULT_MINUTES_PER_BLOCK,
    blocksPerDay: (60 / DEFAULT_MINUTES_PER_BLOCK) * 24,
  };
}

export function useBlockRate() {
  return useQuery({
    queryKey: ['block-rate'],
    queryFn: fetchBlockRate,
    refetchInterval: 5 * 60_000, // refresh every 5 minutes
    staleTime: 2 * 60_000,
    placeholderData: fallback(),
  });
}

/** Convert a time duration (in minutes) to block count, given a block rate */
export function timeToBlocks(minutes: number, minutesPerBlock: number): number {
  return Math.round(minutes / minutesPerBlock);
}

/** Convert block count to minutes, given a block rate */
export function blocksToMinutes(blocks: number, minutesPerBlock: number): number {
  return blocks * minutesPerBlock;
}
