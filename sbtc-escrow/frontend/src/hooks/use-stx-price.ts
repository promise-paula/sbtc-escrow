import { useQuery } from '@tanstack/react-query';

async function fetchStxPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd',
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.blockstack?.usd ?? 0;
  } catch {
    return 0;
  }
}

export function useStxPrice() {
  return useQuery({
    queryKey: ['stx-price'],
    queryFn: fetchStxPrice,
    staleTime: 5 * 60_000, // cache 5 minutes
    refetchInterval: 5 * 60_000,
  });
}
