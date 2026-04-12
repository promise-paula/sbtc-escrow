import { useQuery } from '@tanstack/react-query';
import { STACKS_API_URL } from '@/lib/stacks-config';

async function fetchBlockHeight(): Promise<number> {
  const res = await fetch(`${STACKS_API_URL}/v2/info`);
  if (!res.ok) throw new Error('Failed to fetch block height');
  const data = await res.json();
  return data.stacks_tip_height as number;
}

export function useBlockHeight() {
  return useQuery({
    queryKey: ['block-height'],
    queryFn: fetchBlockHeight,
    refetchInterval: 60_000, // refresh every minute
    staleTime: 30_000,
  });
}
