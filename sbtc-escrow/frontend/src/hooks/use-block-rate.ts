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
  const limit = 30;
  const res = await fetch(`${STACKS_API_URL}/extended/v2/blocks?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch recent blocks');
  const data = await res.json();

  // Use block_time (Stacks block timestamp), NOT burn_block_time (Bitcoin)
  // since stacks-block-height in Clarity tracks Stacks blocks
  const blocks: { block_time: number }[] = data.results ?? [];
  if (blocks.length < 2) {
    return fallback();
  }

  // blocks are returned newest-first; compute time deltas between consecutive blocks
  let totalDeltaSec = 0;
  let count = 0;
  for (let i = 0; i < blocks.length - 1; i++) {
    const delta = blocks[i].block_time - blocks[i + 1].block_time;
    if (delta > 0) {
      totalDeltaSec += delta;
      count++;
    }
  }

  if (count === 0) return fallback();

  const avgSeconds = totalDeltaSec / count;
  const minutesPerBlock = Math.max(avgSeconds / 60, 0.01); // floor at 0.6s

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
