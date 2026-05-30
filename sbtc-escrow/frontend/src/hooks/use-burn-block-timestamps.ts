import { useQuery } from '@tanstack/react-query';
import { STACKS_API_URL } from '@/lib/stacks-config';

/**
 * Fetches REAL wall-clock timestamps for past burn (Bitcoin) blocks from the
 * Stacks API. Returns a `Map<height, Date>` keyed by burn block height.
 *
 * Future blocks (not yet mined) won't appear in the map — callers should
 * estimate those from the observed burn rate (see `useBurnBlockRate`).
 *
 * The query key includes the sorted block list so adding/removing blocks
 * triggers a refetch, while the same set returns cached data. 5-min stale
 * time matches how often we'd reasonably ask about past chain state.
 */
async function fetchBurnBlockTime(height: number): Promise<Date | null> {
  try {
    const res = await fetch(`${STACKS_API_URL}/extended/v2/burn-blocks/${height}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.burn_block_time ? new Date(data.burn_block_time * 1000) : null;
  } catch {
    return null;
  }
}

export function useBurnBlockTimestamps(
  heights: (number | null | undefined)[],
  enabled = true,
) {
  const validHeights = Array.from(
    new Set(heights.filter((h): h is number => typeof h === 'number' && h > 0)),
  ).sort((a, b) => a - b);

  return useQuery({
    queryKey: ['burn-block-timestamps', validHeights],
    queryFn: async (): Promise<Map<number, Date>> => {
      const results = await Promise.all(
        validHeights.map(async (h) => {
          const d = await fetchBurnBlockTime(h);
          return [h, d] as const;
        }),
      );
      return new Map(
        results.filter((r): r is readonly [number, Date] => r[1] !== null),
      );
    },
    enabled: enabled && validHeights.length > 0,
    staleTime: 5 * 60_000,
  });
}
